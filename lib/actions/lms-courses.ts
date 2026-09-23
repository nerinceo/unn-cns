"use server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/result";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeRichText } from "@/lib/sanitize";
import {
  makeVideoKey,
  presignVideoUpload,
  deleteVideoObject,
  isAllowedVideoType,
  isVideoStorageConfigured,
  videoProvider,
  VIDEO_MAX_BYTES,
  VIDEO_TYPE_HINT,
} from "@/lib/lms/video";
import {
  putDoc,
  validateUpload,
  DOC_MIME,
  isDocsStorageConfigured,
  sniffContentType,
} from "@/lib/r2/docs";
import {
  putCover,
  isCoverStorageConfigured,
  isAllowedCoverType,
  COVER_MAX_BYTES,
} from "@/lib/lms/cover";
import {
  isLmsCategory,
  isValidCoursePrice,
  COURSE_PRICE_HINT,
  MIN_COURSE_PRICE,
  MAX_COURSE_PRICE,
  courseSlug,
  courseReadiness,
  MIN_LEARNING_OUTCOMES,
} from "@/lib/lms";
import type { LmsCourse, LmsLecture, LmsLectureKind, LmsSection } from "@/lib/cns/lms";

/**
 * UNN Learn — course authoring (instructor side, CNS).
 *
 * Everything here is owner-scoped. RLS already restricts these tables to the
 * owning instructor, but every action re-establishes ownership in application
 * code too: RLS protects the row, this protects the *decision* (quota,
 * readiness, status transitions), and a silent RLS denial would otherwise
 * surface as a confusing no-op rather than an error message.
 *
 * PRICE IS SET HERE, payouts are not. The instructor picks a band; on approval
 * HUB generates the marketplace listing from this course, so there is exactly
 * one source of truth for what a buyer is charged. Payouts, refunds and the
 * money itself stay in HUB.
 *
 * The status transitions an instructor may make are draft -> pending (submit)
 * and approved -> unpublished; approval is staff-only, enforced by
 * guard_lms_course_self_privilege(), and happens in HUB's admin portal.
 */

const now = () => new Date().toISOString();

/** Split a textarea into trimmed, de-duplicated, non-empty lines. */
function lines(value: FormDataEntryValue | null, max = 12): string[] {
  return Array.from(
    new Set(
      String(value ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ).slice(0, max);
}

type OwnedCourse = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  instructorId: string;
  course: LmsCourse;
};

/** Load a course the caller owns. The single gate every authoring action uses. */
async function ownedCourse(courseId: string): Promise<OwnedCourse | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: instructor } = await supabase
    .from("lms_instructors")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!instructor) return { error: "You are not registered as an instructor." };
  if (instructor.status !== "approved")
    return { error: "Your instructor account is not approved yet." };

  const { data: course } = await supabase
    .from("lms_courses")
    .select("*")
    .eq("id", courseId)
    .eq("instructor_id", instructor.id)
    .maybeSingle();
  if (!course) return { error: "Course not found." };

  return {
    supabase,
    userId: user.id,
    instructorId: instructor.id as string,
    course: course as unknown as LmsCourse,
  };
}

async function ownedLecture(
  lectureId: string,
): Promise<(OwnedCourse & { lecture: LmsLecture }) | { error: string }> {
  const supabase = await createClient();
  const { data: lecture } = await supabase
    .from("lms_lectures")
    .select("*")
    .eq("id", lectureId)
    .maybeSingle();
  if (!lecture) return { error: "Lecture not found." };

  const owned = await ownedCourse(lecture.course_id as string);
  if ("error" in owned) return owned;
  return { ...owned, lecture: lecture as unknown as LmsLecture };
}

function revalidateCourse(courseId: string) {
  revalidatePath(`/instructor/courses/${courseId}`);
  revalidatePath("/instructor");
  revalidatePath("/lms");
}

// ── Read ────────────────────────────────────────────────────────────────────

export type EditPart = {
  id: string;
  title: string | null;
  position: number;
  duration_s: number;
  video_status: string;
  video_error: string | null;
  video_key: string | null;
};

export type EditLecture = LmsLecture & {
  parts: EditPart[];
  resources: { id: string; file_name: string; file_size: number | null }[];
};
export type EditSection = LmsSection & { lectures: EditLecture[] };
export type CourseForEdit = LmsCourse & { sections: EditSection[] };

/** The full authoring tree for the builder. Owner-only. */
export async function getCourseForEdit(courseId: string): Promise<CourseForEdit | null> {
  const owned = await ownedCourse(courseId);
  if ("error" in owned) return null;

  const { data: sectionRows } = await owned.supabase
    .from("lms_sections")
    .select(
      "id, course_id, title, position, lectures:lms_lectures(*, parts:lms_lecture_parts(id, title, position, duration_s, video_status, video_error, video_key), resources:lms_lecture_resources(id, file_name, file_size))",
    )
    .eq("course_id", courseId)
    .order("position");

  const sections = ((sectionRows ?? []) as unknown as EditSection[]).map((s) => ({
    ...s,
    lectures: [...(s.lectures ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({ ...l, parts: [...(l.parts ?? [])].sort((a, b) => a.position - b.position) })),
  }));

  return { ...owned.course, sections };
}

// ── Course + landing page ───────────────────────────────────────────────────

/**
 * Create a draft course. Deliberately asks for almost nothing — title and
 * category — because the fastest way to lose an instructor is a twelve-field
 * form before they have seen the product.
 */
export async function createCourse(
  formData: FormData,
): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: instructor } = await supabase
    .from("lms_instructors")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (instructor?.status !== "approved")
    return { error: "Your instructor account is not approved yet." };

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 6) return { error: "Give your course a title of at least 6 characters." };
  if (title.length > 80) return { error: "Keep the title under 80 characters." };

  const category = String(formData.get("category") ?? "").trim();
  if (!isLmsCategory(category)) return { error: "Choose a category." };

  const { data, error } = await supabase
    .from("lms_courses")
    .insert({
      instructor_id: instructor.id,
      slug: courseSlug(title, Math.random().toString(36).slice(2, 8)),
      title,
      category,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create the course." };

  revalidatePath("/instructor");
  return { ok: true, id: data.id as string };
}

/** Save the landing-page step. */
export async function updateCourseLanding(
  courseId: string,
  formData: FormData,
): Promise<ActionResult> {
  const owned = await ownedCourse(courseId);
  if ("error" in owned) return owned;

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 6) return { error: "Give your course a title of at least 6 characters." };
  if (title.length > 80) return { error: "Keep the title under 80 characters." };

  const subtitle = String(formData.get("subtitle") ?? "").trim();
  if (subtitle.length > 160) return { error: "Keep the short description under 160 characters." };

  const category = String(formData.get("category") ?? "").trim();
  if (!isLmsCategory(category)) return { error: "Choose a category." };

  const level = String(formData.get("level") ?? "all");
  if (!["beginner", "intermediate", "advanced", "all"].includes(level))
    return { error: "Choose a level." };

  const { error } = await owned.supabase
    .from("lms_courses")
    .update({
      title,
      subtitle: subtitle || null,
      category,
      level,
      language: String(formData.get("language") ?? "en").trim() || "en",
      cover_url: String(formData.get("cover_url") ?? "").trim() || null,
      // Sanitized server-side against the same allowlist HUB uses — the
      // editor's output is never trusted, because a direct POST bypasses the
      // editor entirely.
      description: sanitizeRichText(String(formData.get("description") ?? "")) || null,
      what_you_learn: lines(formData.get("what_you_learn"), 8),
      requirements: lines(formData.get("requirements"), 8),
      who_is_for: lines(formData.get("who_is_for"), 8),
      updated_at: now(),
    })
    .eq("id", courseId);
  if (error) return { error: error.message };

  revalidateCourse(courseId);
  return { ok: true };
}

/**
 * Set the price.
 *
 * Stored on the course, not on a listing: HUB generates the marketplace listing
 * from this row on approval and keeps it in step afterwards, so the instructor
 * has one place to change a price and a buyer cannot be quoted something the
 * instructor never chose.
 *
 * A price change on a LIVE course is allowed and propagates — but it never
 * touches an order already placed, because checkout snapshots the amount.
 */
export async function updateCoursePricing(
  courseId: string,
  formData: FormData,
): Promise<ActionResult> {
  const owned = await ownedCourse(courseId);
  if ("error" in owned) return owned;

  const priceRaw = String(formData.get("price") ?? "").trim();
  const price = Number(priceRaw);
  if (priceRaw === "" || !isValidCoursePrice(price)) return { error: COURSE_PRICE_HINT };

  const saleRaw = String(formData.get("sale_price") ?? "").trim();
  let salePrice: number | null = null;
  if (saleRaw) {
    const n = Number(saleRaw);
    // A sale price of 0 would make a paid course free without saying so; a sale
    // is a discount, and giving it away is a price change.
    if (!isValidCoursePrice(n) || n === 0)
      return { error: `The sale price must be between $${MIN_COURSE_PRICE} and $${MAX_COURSE_PRICE}.` };
    if (n >= price) return { error: "The sale price has to be lower than the list price." };
    salePrice = n;
  }

  const startsAt = String(formData.get("sale_starts_at") ?? "").trim() || null;
  const endsAt = String(formData.get("sale_ends_at") ?? "").trim() || null;
  if (startsAt && endsAt && new Date(startsAt) > new Date(endsAt))
    return { error: "The sale end date has to come after the start date." };

  const { error } = await owned.supabase
    .from("lms_courses")
    .update({
      price,
      sale_price: salePrice,
      sale_starts_at: salePrice ? startsAt : null,
      sale_ends_at: salePrice ? endsAt : null,
      updated_at: now(),
    })
    .eq("id", courseId);
  if (error) return { error: error.message };

  // Keep a live listing in step. Only price fields — the listing's own status
  // and approval state belong to HUB and must not be reset from here.
  if (owned.course.listing_id) {
    await createAdminClient()
      .from("marketplace_listings")
      .update({ price, sale_price: salePrice })
      .eq("id", owned.course.listing_id);
  }

  revalidateCourse(courseId);
  return { ok: true };
}

// ── Sections ────────────────────────────────────────────────────────────────

export async function addSection(courseId: string, title: string): Promise<ActionResult> {
  const owned = await ownedCourse(courseId);
  if ("error" in owned) return owned;

  const clean = title.trim();
  if (!clean) return { error: "Give the module a title." };
  if (clean.length > 100) return { error: "Keep the module title under 100 characters." };

  const { data: last } = await owned.supabase
    .from("lms_sections")
    .select("position")
    .eq("course_id", courseId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await owned.supabase.from("lms_sections").insert({
    course_id: courseId,
    title: clean,
    position: (last?.position ?? -1) + 1,
  });
  if (error) return { error: error.message };

  revalidateCourse(courseId);
  return { ok: true };
}

export async function renameSection(sectionId: string, title: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: section } = await supabase
    .from("lms_sections")
    .select("id, course_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section) return { error: "Module not found." };

  const owned = await ownedCourse(section.course_id as string);
  if ("error" in owned) return owned;

  const clean = title.trim();
  if (!clean) return { error: "Give the module a title." };

  const { error } = await owned.supabase
    .from("lms_sections")
    .update({ title: clean })
    .eq("id", sectionId);
  if (error) return { error: error.message };

  revalidateCourse(section.course_id as string);
  return { ok: true };
}

/**
 * Delete a module and everything in it. Refused once anyone is enrolled —
 * silently removing content a learner paid for is a refund request, not a
 * feature. Unpublish the course instead.
 */
export async function deleteSection(sectionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: section } = await supabase
    .from("lms_sections")
    .select("id, course_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section) return { error: "Module not found." };

  const owned = await ownedCourse(section.course_id as string);
  if ("error" in owned) return owned;
  if (owned.course.enrollment_count > 0)
    return { error: "Learners are enrolled, so modules can't be deleted. Unpublish first." };

  const { data: parts } = await owned.supabase
    .from("lms_lecture_parts")
    .select("video_key")
    .in("lecture_id", (
      await owned.supabase.from("lms_lectures").select("id").eq("section_id", sectionId)
    ).data?.map((l) => l.id) ?? []);
  for (const p of parts ?? []) {
    if (p.video_key) await deleteVideoObject(p.video_key);
  }

  const { error } = await owned.supabase.from("lms_sections").delete().eq("id", sectionId);
  if (error) return { error: error.message };

  revalidateCourse(section.course_id as string);
  return { ok: true };
}

export async function reorderSections(
  courseId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const owned = await ownedCourse(courseId);
  if ("error" in owned) return owned;

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await owned.supabase
      .from("lms_sections")
      .update({ position: i })
      .eq("id", orderedIds[i])
      .eq("course_id", courseId);
    if (error) return { error: error.message };
  }

  revalidateCourse(courseId);
  return { ok: true };
}

// ── Lectures ────────────────────────────────────────────────────────────────

export async function addLecture(
  sectionId: string,
  kind: LmsLectureKind,
  title: string,
): Promise<ActionResult & { id?: string }> {
  if (!["video", "article", "quiz"].includes(kind)) return { error: "Unknown lecture type." };
  // CNS already has a question bank; a course-embedded quiz engine is a
  // separate build. Offering the option now would create lectures that can
  // never be completed.
  if (kind === "quiz")
    return { error: "Quizzes are coming soon — add a video or article for now." };

  const supabase = await createClient();
  const { data: section } = await supabase
    .from("lms_sections")
    .select("id, course_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (!section) return { error: "Module not found." };

  const owned = await ownedCourse(section.course_id as string);
  if ("error" in owned) return owned;

  const clean = title.trim();
  if (!clean) return { error: "Give the lecture a title." };
  if (clean.length > 120) return { error: "Keep the lecture title under 120 characters." };

  // Positions are course-wide so the player can walk the curriculum in one
  // ordered pass without re-sorting across modules.
  const { data: last } = await owned.supabase
    .from("lms_lectures")
    .select("position")
    .eq("course_id", section.course_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await owned.supabase
    .from("lms_lectures")
    .insert({
      section_id: sectionId,
      course_id: section.course_id,
      title: clean,
      kind,
      position: (last?.position ?? -1) + 1,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not add the lecture." };

  revalidateCourse(section.course_id as string);
  return { ok: true, id: data.id as string };
}

/** Update a lecture's editable fields. Only the keys supplied are touched. */
export async function updateLecture(
  lectureId: string,
  patch: { title?: string; is_preview?: boolean; content?: string | null },
): Promise<ActionResult> {
  const owned = await ownedLecture(lectureId);
  if ("error" in owned) return owned;

  const update: Record<string, unknown> = { updated_at: now() };

  if (typeof patch.title === "string") {
    const clean = patch.title.trim();
    if (!clean) return { error: "Give the lecture a title." };
    if (clean.length > 120) return { error: "Keep the lecture title under 120 characters." };
    update.title = clean;
  }
  if (typeof patch.is_preview === "boolean") update.is_preview = patch.is_preview;
  if (patch.content !== undefined) update.content = sanitizeRichText(patch.content) || null;

  const { error } = await owned.supabase
    .from("lms_lectures")
    .update(update)
    .eq("id", lectureId);
  if (error) return { error: error.message };

  revalidateCourse(owned.course.id);
  return { ok: true };
}

export async function deleteLecture(lectureId: string): Promise<ActionResult> {
  const owned = await ownedLecture(lectureId);
  if ("error" in owned) return owned;
  if (owned.course.enrollment_count > 0)
    return { error: "Learners are enrolled, so lectures can't be deleted. Unpublish first." };

  const { data: parts } = await owned.supabase
    .from("lms_lecture_parts")
    .select("video_key")
    .eq("lecture_id", lectureId);
  for (const p of parts ?? []) {
    if (p.video_key) await deleteVideoObject(p.video_key as string);
  }

  const { error } = await owned.supabase.from("lms_lectures").delete().eq("id", lectureId);
  if (error) return { error: error.message };

  revalidateCourse(owned.course.id);
  return { ok: true };
}

/**
 * Persist a drag-reorder. `moves` carries the whole course's lecture order so a
 * lecture dragged between modules is repositioned and reparented in one pass —
 * the alternative (reorder, then move) leaves a visible wrong state if the
 * second call fails.
 */
export async function reorderLectures(
  courseId: string,
  moves: { id: string; sectionId: string; position: number }[],
): Promise<ActionResult> {
  const owned = await ownedCourse(courseId);
  if ("error" in owned) return owned;

  for (const m of moves) {
    const { error } = await owned.supabase
      .from("lms_lectures")
      .update({ section_id: m.sectionId, position: m.position, updated_at: now() })
      .eq("id", m.id)
      .eq("course_id", courseId);
    if (error) return { error: error.message };
  }

  revalidateCourse(courseId);
  return { ok: true };
}

// ── Lecture video parts ─────────────────────────────────────────────────────
//
// A lecture holds an ordered list of parts. The lecture stays the UNIT OF
// PROGRESS; parts autoplay in sequence inside it. lms_lectures.duration_s and
// .video_status are DERIVED from the parts by database trigger, so nothing in
// this file writes them — and a lecture only becomes 'ready' once every one of
// its parts is, because a learner hitting a missing part mid-lecture cannot
// tell that apart from the product being broken.

/** Resolve a part to the course that owns it, checking ownership on the way. */
async function ownedPart(
  partId: string,
): Promise<
  | (OwnedCourse & { part: { id: string; lecture_id: string; video_key: string | null } })
  | { error: string }
> {
  const supabase = await createClient();
  const { data: part } = await supabase
    .from("lms_lecture_parts")
    .select("id, lecture_id, course_id, video_key")
    .eq("id", partId)
    .maybeSingle();
  if (!part) return { error: "Video not found." };

  const owned = await ownedCourse(part.course_id as string);
  if ("error" in owned) return owned;
  return {
    ...owned,
    part: {
      id: part.id as string,
      lecture_id: part.lecture_id as string,
      video_key: (part.video_key as string) ?? null,
    },
  };
}

export type VideoUploadTicket =
  | { error: null; uploadUrl: string; key: string; contentType: string; partId: string }
  | { error: string; uploadUrl: null; key: null; contentType: null; partId: null };

/**
 * Create a new part on a lecture and mint a presigned PUT for its video.
 *
 * The part row is created BEFORE the bytes move, so the builder has something
 * to show progress against and something to mark failed. An upload that dies
 * with no row behind it is invisible — that is how you get a stuck spinner.
 *
 * A 2 GB file cannot pass through a server action, so this has to be a
 * presigned browser PUT, which is also why the bucket needs CORS. The quota is
 * checked here, before the bytes move; afterwards it is just an apology.
 */
export async function createLectureVideoUpload(
  lectureId: string,
  file: { fileName: string; fileType: string; fileSize: number },
): Promise<VideoUploadTicket> {
  const fail = (error: string): VideoUploadTicket => ({
    error,
    uploadUrl: null,
    key: null,
    contentType: null,
    partId: null,
  });

  if (!isVideoStorageConfigured()) return fail("Video storage is not configured.");

  const owned = await ownedLecture(lectureId);
  if ("error" in owned) return fail(owned.error);
  if (owned.lecture.kind !== "video") return fail("This lecture is not a video lecture.");

  if (!isAllowedVideoType(file.fileType))
    return fail(`That file type isn't supported. Upload ${VIDEO_TYPE_HINT}.`);
  if (!Number.isFinite(file.fileSize) || file.fileSize <= 0) return fail("Invalid file size.");
  if (file.fileSize > VIDEO_MAX_BYTES)
    return fail(
      `That video is too large. The limit is ${Math.round(VIDEO_MAX_BYTES / 1024 ** 3)}GB.`,
    );

  const { data: instructor } = await owned.supabase
    .from("lms_instructors")
    .select("upload_quota_minutes")
    .eq("id", owned.instructorId)
    .maybeSingle();
  const quotaMinutes = instructor?.upload_quota_minutes ?? 1200;

  const { data: courses } = await owned.supabase
    .from("lms_courses")
    .select("total_duration_s")
    .eq("instructor_id", owned.instructorId);
  const usedMinutes = Math.round(
    (courses ?? []).reduce((n, c) => n + (c.total_duration_s ?? 0), 0) / 60,
  );
  if (usedMinutes >= quotaMinutes)
    return fail(
      `You've used your ${Math.round(quotaMinutes / 60)}h upload allowance. Contact support to raise it.`,
    );

  const { data: last } = await owned.supabase
    .from("lms_lecture_parts")
    .select("position")
    .eq("lecture_id", lectureId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: part, error } = await owned.supabase
    .from("lms_lecture_parts")
    .insert({
      lecture_id: lectureId,
      course_id: owned.course.id,
      position: (last?.position ?? -1) + 1,
      video_status: "uploading",
    })
    .select("id")
    .single();
  if (error || !part) return fail(error?.message ?? "Could not start the upload.");

  const key = makeVideoKey(owned.course.id, file.fileName);
  const uploadUrl = await presignVideoUpload(key, file.fileType);
  return { error: null, uploadUrl, key, contentType: file.fileType, partId: part.id as string };
}

/**
 * Record a completed part upload. `durationS` is measured in the browser from
 * the file's own metadata — with no transcoder there is nothing server-side to
 * ask, and the number only drives display and the readiness checklist, never
 * money.
 */
export async function confirmLectureVideo(
  partId: string,
  info: { key: string; durationS: number; bytes: number; title?: string },
): Promise<ActionResult> {
  const owned = await ownedPart(partId);
  if ("error" in owned) return owned;

  // Only accept a key we minted for this course.
  if (!info.key.startsWith(`lms-video/${owned.course.id}/`))
    return { error: "That upload doesn't belong to this course." };

  const previous = owned.part.video_key;

  const { error } = await owned.supabase
    .from("lms_lecture_parts")
    .update({
      video_provider: videoProvider(),
      video_key: info.key,
      video_uid: null,
      video_bytes: Math.max(0, Math.round(Number(info.bytes) || 0)),
      duration_s: Math.max(0, Math.round(Number(info.durationS) || 0)),
      video_status: "ready",
      video_error: null,
      ...(info.title ? { title: info.title.slice(0, 120) } : {}),
      updated_at: now(),
    })
    .eq("id", partId);
  if (error) return { error: error.message };

  // Replacing a video should not leave the old object paying rent.
  if (previous && previous !== info.key) await deleteVideoObject(previous);

  revalidateCourse(owned.course.id);
  return { ok: true };
}

/** Mark a part upload as failed so the builder shows the real state. */
export async function failLectureVideo(partId: string, message: string): Promise<ActionResult> {
  const owned = await ownedPart(partId);
  if ("error" in owned) return owned;

  await owned.supabase
    .from("lms_lecture_parts")
    .update({
      video_status: owned.part.video_key ? "ready" : "error",
      video_error: message.slice(0, 300),
      updated_at: now(),
    })
    .eq("id", partId);

  revalidateCourse(owned.course.id);
  return { ok: true };
}

/** Rename a part. An untitled part renders as "Part N" in the player. */
export async function renameLecturePart(partId: string, title: string): Promise<ActionResult> {
  const owned = await ownedPart(partId);
  if ("error" in owned) return owned;

  const { error } = await owned.supabase
    .from("lms_lecture_parts")
    .update({ title: title.trim().slice(0, 120) || null, updated_at: now() })
    .eq("id", partId);
  if (error) return { error: error.message };

  revalidateCourse(owned.course.id);
  return { ok: true };
}

export async function deleteLecturePart(partId: string): Promise<ActionResult> {
  const owned = await ownedPart(partId);
  if ("error" in owned) return owned;
  if (owned.course.enrollment_count > 0)
    return { error: "Learners are enrolled — replace the video rather than removing it." };

  if (owned.part.video_key) await deleteVideoObject(owned.part.video_key);

  const { error } = await owned.supabase.from("lms_lecture_parts").delete().eq("id", partId);
  if (error) return { error: error.message };

  revalidateCourse(owned.course.id);
  return { ok: true };
}

/** Persist a reorder of the parts within one lecture. */
export async function reorderLectureParts(
  lectureId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const owned = await ownedLecture(lectureId);
  if ("error" in owned) return owned;

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await owned.supabase
      .from("lms_lecture_parts")
      .update({ position: i, updated_at: now() })
      .eq("id", orderedIds[i])
      .eq("lecture_id", lectureId);
    if (error) return { error: error.message };
  }

  revalidateCourse(owned.course.id);
  return { ok: true };
}


// ── Lecture resources ───────────────────────────────────────────────────────

/**
 * Attach a downloadable file to a lecture.
 *
 * Unlike video, resources go through the SERVER (putDoc) rather than a
 * presigned browser PUT. They are small — the 5 MB doc cap applies — and the
 * server path needs no bucket CORS, which is one less thing to configure and
 * one less silent browser-side failure mode.
 */
export async function addLectureResource(
  lectureId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!isDocsStorageConfigured()) return { error: "Storage is not configured." };

  const owned = await ownedLecture(lectureId);
  if ("error" in owned) return owned;

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a file." };

  const bytes = Buffer.from(await file.arrayBuffer());
  const checked = validateUpload(
    { name: file.name, type: file.type, size: file.size },
    DOC_MIME,
    bytes,
  );
  if (!checked.ok) return { error: checked.error };

  const key = `lms-resource/${owned.course.id}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  await putDoc(key, bytes, checked.contentType);

  const { error } = await owned.supabase.from("lms_lecture_resources").insert({
    lecture_id: lectureId,
    course_id: owned.course.id,
    file_key: key,
    file_name: file.name.slice(0, 200),
    file_size: file.size,
  });
  if (error) return { error: error.message };

  revalidateCourse(owned.course.id);
  return { ok: true };
}

export async function deleteLectureResource(resourceId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: resource } = await supabase
    .from("lms_lecture_resources")
    .select("id, course_id")
    .eq("id", resourceId)
    .maybeSingle();
  if (!resource) return { error: "Resource not found." };

  const owned = await ownedCourse(resource.course_id as string);
  if ("error" in owned) return owned;

  const { error } = await owned.supabase
    .from("lms_lecture_resources")
    .delete()
    .eq("id", resourceId);
  if (error) return { error: error.message };

  revalidateCourse(resource.course_id as string);
  return { ok: true };
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Submit for review. The readiness checklist is re-evaluated here from the
 * database rather than trusted from the client — the sidebar is a convenience,
 * this is the gate. Approval itself happens in HUB's admin portal.
 */
export async function submitCourseForReview(courseId: string): Promise<ActionResult> {
  const owned = await ownedCourse(courseId);
  if ("error" in owned) return owned;

  if (owned.course.status === "pending") return { error: "This course is already in review." };
  if (owned.course.status === "approved") return { error: "This course is already live." };

  const { data: lectures } = await owned.supabase
    .from("lms_lectures")
    .select("kind, is_preview, video_status")
    .eq("course_id", courseId);

  const { items, ready } = courseReadiness(owned.course, lectures ?? []);
  if (!ready) {
    const missing = items.filter((i) => !i.done).map((i) => i.label);
    return { error: `Not ready yet — ${missing.join("; ").toLowerCase()}.` };
  }
  if ((owned.course.what_you_learn?.length ?? 0) < MIN_LEARNING_OUTCOMES)
    return { error: `Add at least ${MIN_LEARNING_OUTCOMES} learning outcomes.` };

  const { error } = await owned.supabase
    .from("lms_courses")
    .update({ status: "pending", updated_at: now() })
    .eq("id", courseId);
  if (error) return { error: error.message };

  // Tell HUB staff there is something in the queue. Best-effort: a failed
  // notification must not lose the submission.
  try {
    const admin = createAdminClient();
    const { data: staff } = await admin
      .from("users")
      .select("id")
      .in("role", ["platform_admin", "platform_moderator"]);
    if (staff?.length) {
      await admin.from("notifications").insert(
        staff.map((s) => ({
          user_id: s.id,
          notification_type: "course_submitted",
          message: `"${owned.course.title}" was submitted for review.`,
          reference_id: courseId,
        })),
      );
    }
  } catch {
    // no-op
  }

  revalidateCourse(courseId);
  return { ok: true };
}

/** Pull a live course off the catalogue. Existing learners keep their access. */
export async function unpublishCourse(courseId: string): Promise<ActionResult> {
  const owned = await ownedCourse(courseId);
  if ("error" in owned) return owned;
  if (owned.course.status !== "approved") return { error: "This course isn't live." };

  const { error } = await owned.supabase
    .from("lms_courses")
    .update({ status: "unpublished", updated_at: now() })
    .eq("id", courseId);
  if (error) return { error: error.message };

  revalidateCourse(courseId);
  return { ok: true };
}

/** Delete a draft outright. The RLS policy already refuses anything live. */
export async function deleteCourse(courseId: string): Promise<ActionResult> {
  const owned = await ownedCourse(courseId);
  if ("error" in owned) return owned;
  if (!["draft", "rejected"].includes(owned.course.status))
    return { error: "Only a draft can be deleted. Unpublish the course instead." };
  if (owned.course.enrollment_count > 0)
    return { error: "Learners are enrolled, so this course can't be deleted." };

  const { data: parts } = await owned.supabase
    .from("lms_lecture_parts")
    .select("video_key")
    .eq("course_id", courseId);
  for (const p of parts ?? []) {
    if (p.video_key) await deleteVideoObject(p.video_key as string);
  }

  const { error } = await owned.supabase.from("lms_courses").delete().eq("id", courseId);
  if (error) return { error: error.message };

  revalidatePath("/instructor");
  return { ok: true };
}

// ── Course cover ────────────────────────────────────────────────────────────

/**
 * Upload a cover image and attach it to the course.
 *
 * Server-side upload (not a presigned browser PUT) because a cover is small and
 * the server path needs no bucket CORS. The content type is sniffed from the
 * bytes rather than trusted from the client — a .png extension on a PDF must
 * not end up served as an image from the public bucket.
 */
export async function uploadCourseCover(
  courseId: string,
  formData: FormData,
): Promise<ActionResult & { url?: string }> {
  if (!isCoverStorageConfigured()) return { error: "Image storage is not configured." };

  const owned = await ownedCourse(courseId);
  if ("error" in owned) return owned;

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose an image." };
  if (file.size > COVER_MAX_BYTES)
    return { error: `Images must be under ${Math.round(COVER_MAX_BYTES / 1024 ** 2)} MB.` };

  const bytes = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffContentType(bytes);
  if (!sniffed || !isAllowedCoverType(sniffed))
    return { error: "Please upload a JPG, PNG or WebP image." };

  const url = await putCover(courseId, bytes, sniffed);

  const { error } = await owned.supabase
    .from("lms_courses")
    .update({ cover_url: url, updated_at: now() })
    .eq("id", courseId);
  if (error) return { error: error.message };

  revalidateCourse(courseId);
  return { ok: true, url };
}

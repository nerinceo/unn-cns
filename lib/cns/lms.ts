import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * UNN Learn — data access for courses delivered in CNS.
 *
 * WHERE THE PIECES LIVE
 * ---------------------
 * HUB and CNS sit on ONE Supabase project, so the `lms_*` tables are already
 * reachable from here with no migration. The split is by responsibility:
 *
 *   HUB  — sells the course (it is a marketplace listing), approves the
 *          instructor and the course, and owns Stripe, orders, payouts,
 *          refunds. Nothing in this file quotes a price or touches money.
 *   CNS  — delivers the course to the learner and hosts the instructor's
 *          authoring dashboard.
 *
 * THE ACCESS GATE IS THE POINT OF THIS FILE. RLS on `lms_lectures` deliberately
 * exposes lecture METADATA for any approved course, because a curriculum has to
 * render before purchase. So a readable row proves nothing about entitlement:
 *
 *     metadata is public · content requires (active enrollment | preview | owner)
 *
 * Playback URLs are minted per request and never embedded in a page payload, so
 * the exposure window is the presigned TTL and nothing longer.
 */

export type LmsCourseStatus =
  | "draft"
  | "pending"
  | "approved"
  | "needs_info"
  | "rejected"
  | "unpublished";

export type LmsLectureKind = "video" | "article" | "quiz";
export type LmsVideoStatus = "none" | "uploading" | "processing" | "ready" | "error";

export type LmsCourse = {
  id: string;
  instructor_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null; // sanitized HTML
  category: string;
  level: string;
  language: string;
  cover_url: string | null;
  what_you_learn: string[] | null;
  requirements: string[] | null;
  who_is_for: string[] | null;
  status: LmsCourseStatus;
  admin_note: string | null;
  enrollment_count: number;
  rating_avg: number | null;
  rating_count: number;
  lecture_count: number;
  total_duration_s: number;
  price: number;
  sale_price: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  currency: string;
  listing_id: string | null;
  contact_hours: number | null;
  created_at: string;
  updated_at?: string | null;
};

export type LmsLectureResource = {
  id: string;
  file_name: string;
  file_size: number | null;
};

export type LmsLecture = {
  id: string;
  section_id: string;
  course_id: string;
  title: string;
  kind: LmsLectureKind;
  position: number;
  is_preview: boolean;
  duration_s: number;
  video_status: LmsVideoStatus;
  video_provider?: string | null;
  video_key?: string | null;
  video_uid?: string | null;
  video_error?: string | null;
  content?: string | null; // sanitized HTML
};

export type LmsSection = {
  id: string;
  course_id: string;
  title: string;
  position: number;
};

export const COURSE_CARD_COLS =
  "id,instructor_id,slug,title,subtitle,category,level,language,cover_url," +
  "status,enrollment_count,rating_avg,rating_count,lecture_count,total_duration_s," +
  "contact_hours,price,sale_price,sale_starts_at,sale_ends_at,currency,listing_id,created_at";

export const COURSE_FULL_COLS = `${COURSE_CARD_COLS},description,what_you_learn,requirements,who_is_for,admin_note,updated_at`;

// ── Entitlement ──────────────────────────────────────────────────────────────

export type Access =
  | { ok: true; userId: string; enrolled: boolean; isOwner: boolean }
  | { ok: false; error: string };

/**
 * What may this caller reach in this course?
 *
 * `enrolled` is the paid gate — it is set by HUB's Stripe webhook when the
 * marketplace listing is purchased, never by anything in CNS. `isOwner` lets an
 * instructor preview their own unpublished work. Neither is inferred from
 * anything the client sent.
 */
export async function courseAccess(courseId: string): Promise<Access> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const [{ data: enrollment }, { data: course }] = await Promise.all([
    supabase
      .from("lms_enrollments")
      .select("status")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .maybeSingle(),
    supabase
      .from("lms_courses")
      .select("instructor_id, instructor:instructor_id(user_id)")
      .eq("id", courseId)
      .maybeSingle(),
  ]);

  const instructor = course?.instructor as { user_id?: string } | null;
  return {
    ok: true,
    userId: user.id,
    enrolled: enrollment?.status === "active",
    isOwner: instructor?.user_id === user.id,
  };
}

// ── Learner reads ────────────────────────────────────────────────────────────

export type EnrolledCourse = {
  enrollmentId: string;
  progressPercent: number;
  completedAt: string | null;
  course: LmsCourse & { instructor: { display_name: string } | null };
};

/** Every course this learner has access to, most recently touched first. */
export async function getMyCourses(): Promise<EnrolledCourse[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("lms_enrollments")
    .select(
      `id, progress_percent, completed_at, updated_at,
       course:course_id(${COURSE_CARD_COLS}, instructor:instructor_id(display_name))`,
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  return ((data ?? []) as unknown as {
    id: string;
    progress_percent: number;
    completed_at: string | null;
    course: (LmsCourse & { instructor: { display_name: string } | null }) | null;
  }[])
    .filter((r) => r.course)
    .map((r) => ({
      enrollmentId: r.id,
      progressPercent: r.progress_percent ?? 0,
      completedAt: r.completed_at,
      course: r.course!,
    }));
}

/**
 * One video inside a lecture. A lecture is the unit of progress; parts autoplay
 * in sequence within it. The object key never leaves the server — playback is a
 * presigned URL minted per part, on demand, after the entitlement check.
 */
export type PlayerPart = {
  id: string;
  title: string | null;
  position: number;
  duration_s: number;
  video_status: LmsVideoStatus;
};

export type PlayerLecture = Pick<
  LmsLecture,
  "id" | "section_id" | "title" | "kind" | "position" | "is_preview" | "duration_s" | "video_status"
> & {
  /** Article body — null unless this caller is entitled to it. */
  content: string | null;
  /** Video parts in order. Empty for article lectures and for locked ones. */
  parts: PlayerPart[];
  locked: boolean;
  completed: boolean;
  /**
   * Resume point, in seconds from the START OF THE LECTURE — cumulative across
   * parts, not an offset into whichever part was playing. Storing it this way
   * means adding or reordering a part cannot silently teleport a learner, and
   * `lms_lecture_progress` needed no schema change to support parts.
   */
  position_s: number;
  resources: LmsLectureResource[];
};

export type PlayerData = {
  course: LmsCourse;
  instructorName: string;
  sections: (LmsSection & { lectures: PlayerLecture[] })[];
  enrolled: boolean;
  isOwner: boolean;
  progressPercent: number;
  completedAt: string | null;
};

/**
 * Everything the player renders, with content stripped from any lecture the
 * caller has not paid for.
 *
 * Locked lectures still appear — a learner should see what they are missing —
 * but carry no body, no resources and no playable video. The strip happens
 * here, server-side, so the content never enters the page payload at all.
 */
export async function getPlayerData(slugOrId: string): Promise<PlayerData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
  const { data: courseRow } = await supabase
    .from("lms_courses")
    .select(`${COURSE_FULL_COLS}, instructor:instructor_id(id,user_id,display_name)`)
    .eq(isUuid ? "id" : "slug", slugOrId)
    .maybeSingle();
  if (!courseRow) return null;

  const course = courseRow as unknown as LmsCourse & {
    instructor: { id: string; user_id: string; display_name: string } | null;
  };

  const access = await courseAccess(course.id);
  if (!access.ok) return null;

  const [{ data: sectionRows }, { data: progressRows }, { data: enrollment }] =
    await Promise.all([
      supabase
        .from("lms_sections")
        .select(
          "id, course_id, title, position, lectures:lms_lectures(id, section_id, course_id, title, kind, position, is_preview, duration_s, video_status, content, parts:lms_lecture_parts(id, title, position, duration_s, video_status), resources:lms_lecture_resources(id, file_name, file_size))",
        )
        .eq("course_id", course.id)
        .order("position"),
      supabase
        .from("lms_lecture_progress")
        .select("lecture_id, completed, position_s")
        .eq("user_id", access.userId)
        .eq("course_id", course.id),
      supabase
        .from("lms_enrollments")
        .select("progress_percent, completed_at")
        .eq("user_id", access.userId)
        .eq("course_id", course.id)
        .maybeSingle(),
    ]);

  const progressBy = new Map(
    (progressRows ?? []).map((p) => [
      p.lecture_id as string,
      { completed: !!p.completed, position_s: (p.position_s as number) ?? 0 },
    ]),
  );

  const entitled = access.enrolled || access.isOwner;

  const sections = ((sectionRows ?? []) as unknown as (LmsSection & {
    lectures: (PlayerLecture & { content: string | null })[];
  })[]).map((s) => ({
    ...s,
    lectures: [...(s.lectures ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((l): PlayerLecture => {
        const locked = !entitled && !l.is_preview;
        const p = progressBy.get(l.id);
        return {
          id: l.id,
          section_id: l.section_id,
          title: l.title,
          kind: l.kind,
          position: l.position,
          is_preview: l.is_preview,
          duration_s: l.duration_s,
          video_status: l.video_status,
          // The strip. A locked lecture's body and its parts never leave the
          // server — without this the part ids would be enough to attempt
          // playback on content nobody paid for.
          content: locked ? null : (l.content ?? null),
          parts: locked
            ? []
            : [...(l.parts ?? [])].sort((a, b) => a.position - b.position),
          resources: locked ? [] : (l.resources ?? []),
          locked,
          completed: p?.completed ?? false,
          position_s: p?.position_s ?? 0,
        };
      }),
  }));

  return {
    course,
    instructorName: course.instructor?.display_name ?? "UNN instructor",
    sections,
    enrolled: access.enrolled,
    isOwner: access.isOwner,
    progressPercent: enrollment?.progress_percent ?? 0,
    completedAt: (enrollment?.completed_at as string | null) ?? null,
  };
}

// ── Instructor reads ─────────────────────────────────────────────────────────

export type InstructorDocument = {
  id: string;
  doc_type: string;
  file_name: string | null;
  expiry_date: string | null;
  status: string;
  created_at: string;
};

export type MyInstructor = {
  id: string;
  user_id: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  expertise: string[] | null;
  website: string | null;
  country: string | null;
  contact_email: string | null;
  license_number: string | null;
  license_country: string | null;
  license_expiry: string | null;
  status: string;
  admin_note: string | null;
  agreement_accepted_at: string | null;
  documents: InstructorDocument[];
};

/**
 * The caller's instructor profile, or null.
 *
 * The row is created and approved in HUB — CNS only reads it. An instructor
 * never signs up here: CNS has no auth UI, so the shared `.nerusalem.com`
 * session carries an approved instructor straight into their dashboard.
 */
export async function getMyInstructor(): Promise<MyInstructor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("lms_instructors")
    .select(
      "id,user_id,display_name,headline,bio,expertise,website,country,contact_email," +
        "license_number,license_country,license_expiry,status,admin_note,agreement_accepted_at," +
        "documents:lms_instructor_documents(id,doc_type,file_name,expiry_date,status,created_at)",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as MyInstructor;
  return { ...row, documents: row.documents ?? [] };
}

/** Courses authored by this instructor. */
export async function getMyAuthoredCourses(instructorId: string): Promise<LmsCourse[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lms_courses")
    .select(COURSE_FULL_COLS)
    .eq("instructor_id", instructorId)
    .order("updated_at", { ascending: false });
  return (data ?? []) as unknown as LmsCourse[];
}

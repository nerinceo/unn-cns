"use server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/result";
import { createClient } from "@/lib/supabase/server";
import { courseAccess } from "@/lib/cns/lms";
import { playbackUrlFor } from "@/lib/lms/video";
import { presignDocRead } from "@/lib/r2/docs";

/**
 * UNN Learn — learner mutations and entitlement-gated reads.
 *
 * Every call re-checks entitlement through courseAccess(). Nothing here trusts
 * a course or lecture id from the client to imply access, because the
 * curriculum is deliberately public: a learner can see every lecture title on
 * the sales page before buying, so ids are not secret and must not be treated
 * as capabilities.
 */

// ── Playback ─────────────────────────────────────────────────────────────────

/**
 * Mint a playback URL for one lecture.
 *
 * Called per lecture, on demand, from the player. Deliberately NOT bundled into
 * getPlayerData(): pre-signing every lecture in a course would hand a learner a
 * bag of live URLs for content they may never open, and would put them in the
 * page source where any extension can read them.
 */
export async function getPartPlayback(
  partId: string,
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient();
  const { data: part } = await supabase
    .from("lms_lecture_parts")
    .select(
      "id, course_id, video_provider, video_key, video_uid, video_status, lecture:lecture_id(is_preview)",
    )
    .eq("id", partId)
    .maybeSingle();
  if (!part) return { error: "Video not found." };

  const access = await courseAccess(part.course_id as string);
  if (!access.ok) return { error: access.error };

  // The preview flag lives on the LECTURE, so every part of a preview lecture
  // is watchable and no part of a paid one is — checking the part alone would
  // let a crafted id reach paid content inside an otherwise-free module.
  const lecture = part.lecture as { is_preview?: boolean } | null;
  if (!access.enrolled && !access.isOwner && !lecture?.is_preview)
    return { error: "Buy this course on the UNN marketplace to watch this lecture." };

  if (part.video_status !== "ready") return { error: "This video is still processing." };

  const url = await playbackUrlFor(part);
  if (!url) return { error: "This video isn't available right now." };
  return { url };
}

/** Presigned download for a lecture attachment. Entitlement-gated identically. */
export async function getResourceDownloadUrl(
  resourceId: string,
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient();
  const { data: resource } = await supabase
    .from("lms_lecture_resources")
    .select("id, course_id, file_key, file_name, lecture:lecture_id(is_preview)")
    .eq("id", resourceId)
    .maybeSingle();
  if (!resource) return { error: "File not found." };

  const access = await courseAccess(resource.course_id as string);
  if (!access.ok) return { error: access.error };
  const lecture = resource.lecture as { is_preview?: boolean } | null;
  if (!access.enrolled && !access.isOwner && !lecture?.is_preview)
    return { error: "Buy this course to download this file." };

  const url = await presignDocRead(
    resource.file_key as string,
    (resource.file_name as string) ?? "resource",
  );
  return { url };
}

// ── Progress ─────────────────────────────────────────────────────────────────

/**
 * Save a resume point. Called on a 10s timer and on tab-hide, so it is the
 * hottest write in the product: no revalidatePath, no notifications, no reads
 * beyond the entitlement check.
 *
 * Progress is recorded only for genuinely enrolled learners. A preview watcher
 * has nothing to resume, and an instructor previewing their own course must not
 * accumulate fake completion data on it.
 */
export async function saveLectureProgress(
  lectureId: string,
  positionS: number,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: lecture } = await supabase
    .from("lms_lectures")
    .select("id, course_id")
    .eq("id", lectureId)
    .maybeSingle();
  if (!lecture) return { ok: false };

  const access = await courseAccess(lecture.course_id as string);
  if (!access.ok || !access.enrolled) return { ok: false };

  const { error } = await supabase.from("lms_lecture_progress").upsert(
    {
      user_id: access.userId,
      lecture_id: lectureId,
      course_id: lecture.course_id,
      position_s: Math.max(0, Math.round(Number(positionS) || 0)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,lecture_id" },
  );

  // Remember where they were, so "Continue" resumes the right lecture.
  await supabase
    .from("lms_enrollments")
    .update({ last_lecture_id: lectureId })
    .eq("user_id", access.userId)
    .eq("course_id", lecture.course_id);

  return { ok: !error };
}

/**
 * Tick or untick a lecture. The enrollment roll-up (and therefore the course
 * completion date) is recalculated by a database trigger, not here — the player
 * writes progress from several places and an app-layer roll-up would race.
 */
export async function setLectureComplete(
  lectureId: string,
  completed: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: lecture } = await supabase
    .from("lms_lectures")
    .select("id, course_id")
    .eq("id", lectureId)
    .maybeSingle();
  if (!lecture) return { error: "Lecture not found." };

  const access = await courseAccess(lecture.course_id as string);
  if (!access.ok) return { error: access.error };
  if (!access.enrolled) return { error: "You need access to this course to track progress." };

  const { error } = await supabase.from("lms_lecture_progress").upsert(
    {
      user_id: access.userId,
      lecture_id: lectureId,
      course_id: lecture.course_id,
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,lecture_id" },
  );
  if (error) return { error: error.message };

  revalidatePath("/lms");
  return { ok: true };
}

// ── Reviews ──────────────────────────────────────────────────────────────────

/**
 * Leave or update a course review.
 *
 * The enrollment requirement is enforced by the RLS insert policy as well as
 * here — a review is social proof that money changed hands, so it must not be
 * plantable by someone who never bought the course.
 */
export async function submitCourseReview(
  courseId: string,
  rating: number,
  body: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const access = await courseAccess(courseId);
  if (!access.ok) return { error: access.error };
  if (!access.enrolled) return { error: "Only enrolled learners can review a course." };
  if (access.isOwner) return { error: "You can't review your own course." };

  const clean = Math.round(Number(rating));
  if (!Number.isFinite(clean) || clean < 1 || clean > 5)
    return { error: "Choose a rating from 1 to 5." };

  const { error } = await supabase.from("lms_reviews").upsert(
    {
      course_id: courseId,
      user_id: access.userId,
      rating: clean,
      body: body.trim().slice(0, 2000) || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "course_id,user_id" },
  );
  if (error) return { error: error.message };

  revalidatePath(`/lms/${courseId}`);
  return { ok: true };
}

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/errors";
import type { QuizMode } from "@/lib/lms/quiz";

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

  const [{ data: enrollment, error: enrollmentError }, { data: course, error: courseError }] = await Promise.all([
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
  if (enrollmentError) logError("lms:courseAccess:enrollment", enrollmentError, { courseId });
  if (courseError) logError("lms:courseAccess:course", courseError, { courseId });

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
  /** Set once the learner has earned one (HUB migration 0076). */
  certificateNo: string | null;
};

/** Every course this learner has access to, most recently touched first. */
export async function getMyCourses(): Promise<EnrolledCourse[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [{ data }, { data: certRows, error: certError }] = await Promise.all([
    supabase
      .from("lms_enrollments")
      .select(
        `id, progress_percent, completed_at, updated_at,
         course:course_id(${COURSE_CARD_COLS}, instructor:instructor_id(display_name))`,
      )
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false }),
    supabase
      .from("lms_certificates")
      .select("course_id, certificate_no")
      .eq("user_id", user.id)
      .is("revoked_at", null),
  ]);
  // A failed certificate read must not hide the learner's courses.
  if (certError) logError("lms:getMyCourses:certificates", certError);
  const certBy = new Map(
    (certRows ?? []).map((c) => [c.course_id as string, c.certificate_no as string]),
  );

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
      certificateNo: certBy.get(r.course!.id) ?? null,
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
  /** Kind 'quiz' only: its rules and this learner's history. Never the questions. */
  quiz: PlayerQuiz | null;
};

/**
 * A quiz as the player shows it before an attempt starts. The settings are not
 * secret (RLS exposes them like lecture metadata); the questions are fetched
 * only by starting an attempt, through lms_start_attempt().
 */
export type PlayerQuiz = {
  id: string;
  mode: QuizMode;
  pass_percent: number;
  time_limit_min: number | null;
  /** Questions in one attempt: the draw count, capped at what is written. */
  questions_per_attempt: number;
  max_attempts: number | null;
  retake_wait_hours: number;
  attemptsUsed: number;
  passed: boolean;
  best: number | null;
  last: { id: string; percent: number; passed: boolean; submitted_at: string } | null;
  /** An attempt still running — the player resumes it instead of starting another. */
  openAttemptId: string | null;
  /** Set while the retake wait is running. */
  nextAvailableAt: string | null;
};

export type PlayerCertificate = { certificate_no: string; issued_at: string };

export type PlayerData = {
  course: LmsCourse;
  instructorName: string;
  sections: (LmsSection & { lectures: PlayerLecture[] })[];
  enrolled: boolean;
  isOwner: boolean;
  progressPercent: number;
  completedAt: string | null;
  /** True when the course has a final exam — the only route to a certificate. */
  hasFinal: boolean;
  certificate: PlayerCertificate | null;
};

type QuizRow = {
  id: string;
  mode: QuizMode;
  pass_percent: number;
  time_limit_min: number | null;
  draw_count: number | null;
  max_attempts: number | null;
  retake_wait_hours: number;
  question_count: number;
};

type AttemptRow = {
  id: string;
  quiz_id: string;
  status: "in_progress" | "submitted";
  deadline_at: string | null;
  submitted_at: string | null;
  percent: number | null;
  passed: boolean | null;
};

function toPlayerQuiz(q: QuizRow, attempts: AttemptRow[]): PlayerQuiz {
  const done = attempts
    .filter((a) => a.status === "submitted" && a.submitted_at)
    .sort((a, b) => (a.submitted_at! < b.submitted_at! ? 1 : -1));
  const open = attempts.find((a) => a.status === "in_progress") ?? null;
  const last = done[0] ?? null;
  const waitUntil =
    last && q.retake_wait_hours > 0
      ? new Date(new Date(last.submitted_at!).getTime() + q.retake_wait_hours * 3_600_000)
      : null;
  return {
    id: q.id,
    mode: q.mode,
    pass_percent: q.pass_percent,
    time_limit_min: q.time_limit_min,
    questions_per_attempt: Math.min(q.draw_count ?? q.question_count, q.question_count),
    max_attempts: q.max_attempts,
    retake_wait_hours: q.retake_wait_hours,
    attemptsUsed: done.length,
    passed: done.some((a) => a.passed),
    best: done.length ? Math.max(...done.map((a) => a.percent ?? 0)) : null,
    last: last
      ? { id: last.id, percent: last.percent ?? 0, passed: !!last.passed, submitted_at: last.submitted_at! }
      : null,
    openAttemptId: open?.id ?? null,
    nextAvailableAt: waitUntil && waitUntil.getTime() > Date.now() ? waitUntil.toISOString() : null,
  };
}

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

  const [
    { data: sectionRows },
    { data: quizRows, error: quizzesError },
    { data: progressRows },
    { data: enrollment },
    { data: attemptRows, error: attemptsError },
    { data: certificateRow, error: certificateError },
  ] = await Promise.all([
    supabase
      .from("lms_sections")
      .select(
        // No `content` here: lecture bodies are not readable through the
        // session (migration 0093 — the database used to hand every paid body
        // to anyone who asked). They are fetched below, only for lectures this
        // caller may open.
        "id, course_id, title, position, lectures:lms_lectures(id, section_id, course_id, title, kind, position, is_preview, duration_s, video_status, parts:lms_lecture_parts(id, title, position, duration_s, video_status), resources:lms_lecture_resources(id, file_name, file_size))",
      )
      .eq("course_id", course.id)
      .order("position"),
    // Quiz settings are a SEPARATE read on purpose: if it fails (e.g. migration
    // 0076 not yet applied) only quizzes are missing — video and article
    // lectures render exactly as before.
    supabase
      .from("lms_quizzes")
      .select("id, lecture_id, mode, pass_percent, time_limit_min, draw_count, max_attempts, retake_wait_hours, question_count")
      .eq("course_id", course.id),
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
    supabase
      .from("lms_quiz_attempts")
      .select("id, quiz_id, status, deadline_at, submitted_at, percent, passed")
      .eq("user_id", access.userId)
      .eq("course_id", course.id),
    supabase
      .from("lms_certificates")
      .select("certificate_no, issued_at")
      .eq("user_id", access.userId)
      .eq("course_id", course.id)
      .is("revoked_at", null)
      .maybeSingle(),
  ]);
  if (quizzesError) logError("lms:getPlayerData:quizzes", quizzesError, { courseId: course.id });
  if (attemptsError) logError("lms:getPlayerData:attempts", attemptsError, { courseId: course.id });
  const quizByLecture = new Map(
    ((quizRows ?? []) as (QuizRow & { lecture_id: string })[]).map((q) => [q.lecture_id, q]),
  );
  if (certificateError) logError("lms:getPlayerData:certificate", certificateError, { courseId: course.id });

  const attemptsByQuiz = new Map<string, AttemptRow[]>();
  for (const a of (attemptRows ?? []) as AttemptRow[]) {
    attemptsByQuiz.set(a.quiz_id, [...(attemptsByQuiz.get(a.quiz_id) ?? []), a]);
  }
  let hasFinal = false;

  const progressBy = new Map(
    (progressRows ?? []).map((p) => [
      p.lecture_id as string,
      { completed: !!p.completed, position_s: (p.position_s as number) ?? 0 },
    ]),
  );

  const entitled = access.enrolled || access.isOwner;

  // Bodies for the lectures this caller may open — every lecture when
  // entitled, otherwise previews only. Service role because the column is
  // withheld from the session; the id list IS the entitlement check.
  const openIds = ((sectionRows ?? []) as unknown as { lectures: { id: string; is_preview: boolean }[] | null }[])
    .flatMap((s) => s.lectures ?? [])
    .filter((l) => entitled || l.is_preview)
    .map((l) => l.id);
  const contentBy = new Map<string, string | null>();
  if (openIds.length > 0) {
    const { data: bodyRows, error: bodyError } = await createAdminClient()
      .from("lms_lectures")
      .select("id, content")
      .eq("course_id", course.id)
      .in("id", openIds);
    if (bodyError) logError("lms:getPlayerData:content", bodyError, { courseId: course.id });
    for (const b of bodyRows ?? []) contentBy.set(b.id as string, (b.content as string | null) ?? null);
  }

  const sections = ((sectionRows ?? []) as unknown as (LmsSection & {
    lectures: Omit<PlayerLecture, "quiz">[];
  })[]).map((s) => ({
    ...s,
    lectures: [...(s.lectures ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((l): PlayerLecture => {
        const locked = !entitled && !l.is_preview;
        const p = progressBy.get(l.id);
        const quizRow = l.kind === "quiz" ? (quizByLecture.get(l.id) ?? null) : null;
        if (quizRow?.mode === "final") hasFinal = true;
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
          content: locked ? null : (contentBy.get(l.id) ?? null),
          parts: locked
            ? []
            : [...(l.parts ?? [])].sort((a, b) => a.position - b.position),
          resources: locked ? [] : (l.resources ?? []),
          locked,
          completed: p?.completed ?? false,
          position_s: p?.position_s ?? 0,
          quiz: quizRow ? toPlayerQuiz(quizRow, attemptsByQuiz.get(quizRow.id) ?? []) : null,
        };
      }),
  }));

  return {
    course,
    instructorName: course.instructor?.display_name ?? "Nerusalem instructor",
    sections,
    enrolled: access.enrolled,
    isOwner: access.isOwner,
    progressPercent: enrollment?.progress_percent ?? 0,
    completedAt: (enrollment?.completed_at as string | null) ?? null,
    hasFinal,
    certificate: (certificateRow as PlayerCertificate | null) ?? null,
  };
}

// ── Certificates ─────────────────────────────────────────────────────────────
//
// Issued by the database, never by this app: lms__issue_certificate() in HUB
// migration 0076 runs when every lecture is complete AND the final exam is
// passed. Here they are only read.

export type Certificate = {
  id: string;
  certificate_no: string;
  verification_code: string;
  learner_name: string;
  course_title: string;
  instructor_name: string | null;
  contact_hours: number | null;
  final_percent: number | null;
  issued_at: string;
  revoked_at: string | null;
  course: { slug: string } | null;
};

const CERTIFICATE_NO = /^NER-\d{4}-\d{6,}$/;

/** One of the caller's own certificates (RLS: user_id = auth.uid()). */
export async function getMyCertificate(certificateNo: string): Promise<Certificate | null> {
  if (!CERTIFICATE_NO.test(certificateNo)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("lms_certificates")
    .select(
      "id, certificate_no, verification_code, learner_name, course_title, instructor_name, contact_hours, final_percent, issued_at, revoked_at, course:course_id(slug)",
    )
    .eq("certificate_no", certificateNo)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) logError("lms:getMyCertificate", error, { certificateNo });
  return (data as unknown as Certificate | null) ?? null;
}

export type VerifiedCertificate = {
  certificate_no: string;
  learner_name: string;
  course_title: string;
  instructor_name: string | null;
  contact_hours: number | null;
  issued_at: string;
  revoked: boolean;
};

/**
 * Public check behind /verify/<code>. Works signed out: the lookup is a
 * SECURITY DEFINER function keyed on a 32-hex random code that returns only
 * what is printed on the certificate, so nothing is enumerable.
 */
export async function verifyCertificate(code: string): Promise<VerifiedCertificate | null> {
  if (!/^[0-9a-f]{32}$/.test(code)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lms_verify_certificate", { p_code: code });
  if (error) logError("lms:verifyCertificate", error);
  return (data as VerifiedCertificate | null) ?? null;
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

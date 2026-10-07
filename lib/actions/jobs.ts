"use server";


import type { ActionResult } from "@/lib/actions/result";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { checkLimit } from "@/lib/ratelimit";
import { getJobLabels } from "@/lib/cns/taxonomy";
import { notifyUser, notifyUsers } from "@/lib/cns/notify";
import { getApplicationResumeTarget } from "@/lib/cns/application-resume-access";
import { actionError, logError, userMessage } from "@/lib/errors";
import { SALARY_PERIODS } from "@/lib/cns/job-constants";
import {
  LIMITS, all, bool, hasKey, optDate, optEmail, optId, optInt, optMoney, optOneOf, optText, optUrl,
  reqId, reqInt, reqOneOf, reqText, reqUrl, type Valid,
} from "@/lib/validate";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/* --------------------------------- employers ------------------------------ */

export async function registerEmployer(input: {
  name: string;
  employer_type: string;
  description?: string;
  website?: string;
  email?: string;
  country?: string;
  city?: string;
}): Promise<ActionResult & { employerId?: string; id?: string; slug?: string }> {
  if (!input || typeof input !== "object") return { error: "Organisation name is required." };
  const v = all({
    name: reqText(input.name, "Organisation name", LIMITS.name, { noEmoji: true }),
    employer_type: reqOneOf(input.employer_type, "Organisation type", EMPLOYER_TYPES),
    description: optText(input.description, "Description", LIMITS.description, { multiline: true }),
    website: optUrl(input.website, "Website"),
    email: optEmail(input.email, "Email"),
    country: optText(input.country, "Country", LIMITS.label),
    city: optText(input.city, "City", LIMITS.name),
  });
  if (!v.ok) return { error: v.error };

  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  const supabase = await createClient();
  const slug = `${slugify(v.value.name)}-${Math.random().toString(36).slice(2, 6)}`;

  // Only the keys the caller sent, so a column default still applies to one it
  // left out — exactly as the old `...input` spread behaved.
  const row: Record<string, unknown> = {};
  for (const k of Object.keys(v.value) as (keyof typeof v.value)[]) {
    if (hasKey(input, k)) row[k] = v.value[k];
  }

  const { data, error } = await supabase
    .from("cns_employers")
    .insert({ ...row, slug, created_by: user.id, status: "pending" })
    .select("id")
    .single();
  if (error) return actionError("jobs:registerEmployer", error);

  // The registrant becomes an approved OWNER immediately. The gate that matters
  // is the employer's own status: 'pending' blocks publishing until staff
  // approve, so nothing reaches the public board regardless.
  const { error: ownerError } = await supabase.from("cns_employer_members").insert({
    employer_id: data.id,
    user_id: user.id,
    role: "owner",
    status: "approved",
  });
  if (ownerError) logError("jobs:registerEmployer:owner", ownerError, { employerId: data.id });

  revalidatePath("/employer");
  return { id: data.id as string };
}

/* ----------------------------------- jobs --------------------------------- */

/**
 * What the composer is allowed to write.
 *
 * Notably absent: status, published_at, reviewed_by, reviewed_at, employer_id,
 * created_by, slug, views_count. Those are set by the system or by staff.
 */
const JOB_EDITABLE_FIELDS = [
  "title", "description", "responsibilities", "qualifications",
  "employment_type", "nursing_role", "specialty", "work_setting",
  "experience_level", "is_remote", "work_mode",
  "country", "state", "city", "street_address", "postal_code",
  "experience_min_years", "qualification_required", "license_required",
  "language_requirements", "salary_min", "salary_max", "salary_currency",
  "salary_period", "salary_undisclosed", "salary_text", "vacancies",
  "application_deadline", "apply_mode", "external_apply_url", "internal_ref",
  "visa_sponsorship",
] as const;

/**
 * A database error an employer can act on.
 *
 * A check-constraint violation reached the composer verbatim during testing --
 * `violates check constraint "cns_jobs_employment_type_check"` is not
 * something to show anyone, and it also leaks schema detail.
 */
function friendlyJobError(error: { message: string; code?: string }): string {
  const m = error.message;
  if (/employment_type_check/.test(m)) return "Please choose an employment type from the list.";
  if (/nursing_role_check/.test(m)) return "Please choose a nursing role from the list.";
  if (/specialty_check/.test(m)) return "Please choose a specialty from the list.";
  if (/work_setting_check/.test(m)) return "Please choose a work setting from the list.";
  if (/experience_level_check/.test(m)) return "Please choose an experience level from the list.";
  if (/status_check/.test(m) || error.code === "42501") {
    return "Nerusalem reviews every posting — a job cannot be published directly.";
  }
  if (/violates check constraint|invalid input value/.test(m)) {
    return "Some of those details were not accepted. Please review the highlighted fields.";
  }
  return userMessage(error);
}

/** cns_employers.employer_type CHECK constraint. */
const EMPLOYER_TYPES = ["hospital", "clinic", "agency", "university", "other"] as const;
/** cns_jobs CHECK constraints (cns_jobs_v1_alignment.sql). */
const EMPLOYMENT_TYPES = [
  "full-time", "part-time", "casual", "temporary", "contract", "permanent", "internship", "travel-assignment",
] as const;
const EXPERIENCE_LEVELS = ["none", "under-1", "1-3", "3-5", "5-plus"] as const;
const WORK_MODES = ["onsite", "hybrid", "remote"] as const;
const APPLY_MODES = ["in_app", "external"] as const;
/** The statuses cns_set_application_status() accepts. */
const APPLICATION_STATUSES = ["under_review", "shortlisted", "interview", "selected", "not_selected"] as const;
const LIFECYCLE = ["paused", "active", "closed"] as const;
/** cns_job_reports.reason CHECK constraint. */
const REPORT_REASONS = [
  "suspicious_job", "inaccurate_information", "discrimination", "payment_request",
  "expired_job", "duplicate_job", "other",
] as const;
const QUESTION_TYPES = ["short_answer", "yes_no", "number"] as const;
const YES_NO = ["yes", "no"] as const;
/** numeric(12,2) */
const SALARY_MAX = 9_999_999_999;
const CURRENCY = /^[A-Z]{3}$/;
const okValue = <T>(value: T): Valid<T> => ({ ok: true, value });

/**
 * Validate the composer's payload. Only keys actually present are checked and
 * returned, so an edit that sends a subset leaves the other columns alone —
 * the same contract as the old whitelist loop. Columns the database requires
 * (title, employment_type, work_mode, vacancies, apply_mode) are required
 * whenever sent, and the title always on create.
 */
function validateJobInput(input: Record<string, unknown>, isNew: boolean): Valid<Record<string, unknown>> {
  const ml = { multiline: true };
  const checks: Record<(typeof JOB_EDITABLE_FIELDS)[number], () => Valid<unknown>> = {
    title: () => reqText(input.title, "Job title", LIMITS.title, { noEmoji: true }),
    // NOT NULL in the database, but a draft may be saved before it is written —
    // submitJobForReview() is the gate that demands 100+ characters. So a blank
    // draft description stays the column's one legal blank, as it always was.
    description: () => {
      const r = optText(input.description, "Description", LIMITS.description, ml);
      return r.ok ? okValue(r.value ?? "") : r;
    },
    responsibilities: () => optText(input.responsibilities, "Responsibilities", LIMITS.description, ml),
    qualifications: () => optText(input.qualifications, "Qualifications", LIMITS.description, ml),
    employment_type: () => reqOneOf(input.employment_type, "Employment type", EMPLOYMENT_TYPES),
    // Taxonomy slugs. The vocabulary is staff-editable data, so it is checked
    // for length here (no query) and for membership by the composer's options.
    nursing_role: () => optText(input.nursing_role, "Nursing role", LIMITS.slug),
    specialty: () => optText(input.specialty, "Specialty", LIMITS.slug),
    work_setting: () => optText(input.work_setting, "Work setting", LIMITS.slug),
    experience_level: () => optOneOf(input.experience_level, "Experience required", EXPERIENCE_LEVELS),
    is_remote: () => okValue(bool(input.is_remote)),
    work_mode: () => reqOneOf(input.work_mode, "Work mode", WORK_MODES),
    country: () => optText(input.country, "Country", LIMITS.label),
    state: () => optText(input.state, "State", LIMITS.name),
    city: () => optText(input.city, "City", LIMITS.name),
    street_address: () => optText(input.street_address, "Street address", LIMITS.short),
    postal_code: () => optText(input.postal_code, "Postal code", LIMITS.phone),
    experience_min_years: () => optInt(input.experience_min_years, "Minimum experience", { min: 0, max: 60 }),
    qualification_required: () => optText(input.qualification_required, "Qualification required", LIMITS.short),
    license_required: () => okValue(bool(input.license_required)),
    language_requirements: () => optText(input.language_requirements, "Language requirements", LIMITS.short),
    salary_min: () => optMoney(input.salary_min, "Salary from", { min: 0, max: SALARY_MAX }),
    salary_max: () => optMoney(input.salary_max, "Salary to", { min: 0, max: SALARY_MAX }),
    salary_currency: () => {
      const r = optText(input.salary_currency, "Currency", 3);
      if (!r.ok || r.value === null) return r;
      const c = r.value.toUpperCase();
      return CURRENCY.test(c) ? okValue(c) : { ok: false, error: "Currency is not valid." };
    },
    salary_period: () => optOneOf(input.salary_period, "Salary period", SALARY_PERIODS),
    salary_undisclosed: () => okValue(bool(input.salary_undisclosed)),
    salary_text: () => optText(input.salary_text, "Salary", LIMITS.short),
    vacancies: () => reqInt(input.vacancies, "Vacancies", { min: 1, max: 100000 }),
    application_deadline: () => optDate(input.application_deadline, "Application deadline"),
    apply_mode: () => reqOneOf(input.apply_mode, "Apply mode", APPLY_MODES),
    // cns_jobs_external_url: an external apply mode needs a link.
    external_apply_url: () =>
      input.apply_mode === "external"
        ? reqUrl(input.external_apply_url, "External apply link")
        : optUrl(input.external_apply_url, "External apply link"),
    internal_ref: () => optText(input.internal_ref, "Internal reference", LIMITS.label),
    visa_sponsorship: () => okValue(bool(input.visa_sponsorship)),
  };

  const out: Record<string, unknown> = {};
  for (const k of JOB_EDITABLE_FIELDS) {
    if (!hasKey(input, k) && !(k === "title" && isNew)) continue;
    const r = checks[k]();
    if (!r.ok) return { ok: false, error: r.error };
    out[k] = r.value;
  }
  if (input.apply_mode === "external" && !hasKey(input, "external_apply_url")) {
    return { ok: false, error: "External apply link is required." };
  }
  const lo = out.salary_min as number | null | undefined;
  const hi = out.salary_max as number | null | undefined;
  if (lo != null && hi != null && lo > hi) {
    return { ok: false, error: "“Salary from” cannot be more than “Salary to”." };
  }
  return okValue(out);
}

export async function saveJob(
  employerId: string,
  input: Record<string, unknown>,
  jobId?: string
): Promise<ActionResult & { jobId?: string; id?: string; slug?: string }> {
  const ids = all({ employerId: reqId(employerId, "Employer"), jobId: optId(jobId, "Job") });
  if (!ids.ok) return { error: ids.error };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Nothing to save." };
  const fields = validateJobInput(input, !ids.value.jobId);
  if (!fields.ok) return { error: fields.error };
  employerId = ids.value.employerId;
  jobId = ids.value.jobId ?? undefined;

  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  // Only new postings are limited; editing a draft repeatedly is normal work.
  if (!jobId) {
    const limited = await checkLimit("post", user.id);
    if (limited) return limited;
  }

  const supabase = await createClient();

  // Whitelist. `input` comes from a client, and spreading it straight into the
  // row let an employer send status:'active' and put a job live without review
  // -- verified against production. The database trigger is the real guard
  // (a direct PostgREST call never reaches this function), but nothing here
  // should be forwarding fields the composer does not own either.
  // validateJobInput() returns only whitelisted keys the caller actually sent.
  const payload: Record<string, unknown> = {
    employer_id: employerId,
    updated_at: new Date().toISOString(),
    ...fields.value,
  };

  if (jobId) {
    const { error } = await supabase.from("cns_jobs").update(payload).eq("id", jobId);
    if (error) {
      logError("jobs:saveJob:update", error, { jobId });
      return { error: friendlyJobError(error) };
    }
    revalidatePath(`/employer/${employerId}`);
    return { id: jobId };
  }

  const { data, error } = await supabase
    .from("cns_jobs")
    .insert({
      ...payload,
      slug: `${slugify(String(fields.value.title ?? "job"))}-${Math.random().toString(36).slice(2, 7)}`,
      created_by: user.id,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) {
    logError("jobs:saveJob:insert", error, { employerId });
    return { error: friendlyJobError(error) };
  }
  revalidatePath(`/employer/${employerId}`);
  return { id: data.id as string };
}

/**
 * Employer submits a job for review.
 *
 * Blueprint §3: "Only approved jobs can become publicly visible", and §9.2
 * gives admins a job review queue. So an employer can no longer publish
 * directly — submitting moves the job to 'submitted' and an admin decides.
 *
 * The quality gates run HERE rather than at approval time, so an employer is
 * told what is missing while they still have the form open, instead of waiting
 * a day to be rejected for a missing deadline.
 */
export async function submitJobForReview(jobId: string): Promise<ActionResult> {
  const id = reqId(jobId, "Job");
  if (!id.ok) return { error: id.error };
  jobId = id.value;
  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("cns_jobs")
    .select("title,description,country,nursing_role,work_setting,application_deadline,employer_id")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) logError("jobs:submitJobForReview:job", jobError, { jobId });
  if (!job) return { error: "Job not found" };

  const missing: string[] = [];
  if (!job.title?.trim()) missing.push("a job title");
  if (!job.description || job.description.trim().length < 100)
    missing.push("a fuller description (at least 100 characters)");
  if (!job.country) missing.push("a country");
  if (!job.nursing_role) missing.push("a nursing role");
  if (!job.work_setting) missing.push("a work setting");
  // Not pedantry: Google reads a missing expiry as a quality signal against the
  // listing, and a board of undated jobs risks every listing being delisted.
  if (!job.application_deadline) missing.push("an application deadline");
  if (missing.length) return { error: `Add ${missing.join(", ")} before submitting.` };

  const { data: employer, error: employerError } = await supabase
    .from("cns_employers")
    .select("status")
    .eq("id", job.employer_id as string)
    .maybeSingle();
  if (employerError) logError("jobs:submitJobForReview:employer", employerError, { jobId });
  if (employer?.status !== "approved")
    return { error: "Your organisation is still awaiting approval." };

  const { error } = await supabase
    .from("cns_jobs")
    .update({ status: "submitted", updated_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) return actionError("jobs:submitJobForReview", error);

  revalidatePath(`/employer/${job.employer_id}/jobs`);
  revalidatePath("/admin/jobs");
  return { ok: true };
}

/** Employer pauses or closes a live job. Neither needs admin involvement. */
export async function setJobLifecycle(jobId: string, next: "paused" | "active" | "closed"): Promise<ActionResult> {
  const v = all({ jobId: reqId(jobId, "Job"), next: reqOneOf(next, "Status", LIFECYCLE) });
  if (!v.ok) return { error: v.error };
  jobId = v.value.jobId;
  next = v.value.next;
  const supabase = await createClient();

  // Resuming a paused job returns it to 'active' without re-review; it was
  // already approved once and its content has not changed.
  const { error } = await supabase
    .from("cns_jobs")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("status", next === "active" ? ["paused"] : ["active", "paused"]);
  if (error) return actionError("jobs:setJobLifecycle", error);

  revalidatePath("/jobs");
  return { ok: true };
}

/* -------------------------------- applications ---------------------------- */

/**
 * Snapshot of the applicant, frozen at apply time.
 *
 * DELIBERATELY EXCLUDES email, phone, date_of_birth and address. Those are
 * released only when the employer moves the application to 'shortlisted'.
 * Keeping CNS out of the PII business was an explicit product decision — do not
 * widen this without revisiting it.
 */
async function buildSnapshot(userId: string) {
  const supabase = await createClient();

  const [{ data: u }, { data: p }, { data: sp }, labels] = await Promise.all([
    supabase
      .from("users")
      .select("full_name,professional_title,bio,country,profile_photo,verification_status,role")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("education,experience,skills,languages,certificates")
      .eq("user_id", userId)
      .maybeSingle(),
    // The CNS job profile — the fields a nurse fills specifically for job
    // applications. These were never captured before, so employers saw only
    // the generic HUB profile and none of the role, experience, specialties,
    // licensure or qualifications the applicant actually entered.
    supabase
      .from("career_profiles")
      .select("nursing_role,is_student,experience_level,total_years,specialties,licence_country,licence_type,licence_status,highest_qualification,institution,graduation_year,preferred_countries,preferred_roles,preferred_employment_types,preferred_work_settings")
      .eq("user_id", userId)
      .maybeSingle(),
    getJobLabels(),
  ]);

  // Resolve taxonomy slugs to labels AT CAPTURE TIME, so the snapshot stays
  // self-describing and frozen — renaming a taxonomy entry later cannot change
  // what an employer sees a past applicant claimed.
  const one = (map: Record<string, string>, v: string | null) => (v ? map[v] ?? v : null);
  const many = (map: Record<string, string>, v: string[] | null) => (v ?? []).map((x) => map[x] ?? x);

  // Deliberately EXCLUDES phone and licence_number: phone is contact PII (still
  // released only on shortlist, via users), and a licence number is a sensitive
  // identifier the employer does not need before making contact.
  const seeker = sp
    ? {
        nursing_role: one(labels.nursing_role, sp.nursing_role as string | null),
        is_student: Boolean(sp.is_student),
        experience_level: one(labels.experience_level, sp.experience_level as string | null),
        total_years: (sp.total_years as number) ?? null,
        specialties: many(labels.specialty, sp.specialties as string[] | null),
        licence_country: one(labels.country, sp.licence_country as string | null),
        licence_type: (sp.licence_type as string) ?? null,
        licence_status: (sp.licence_status as string) ?? null,
        highest_qualification: (sp.highest_qualification as string) ?? null,
        institution: (sp.institution as string) ?? null,
        graduation_year: (sp.graduation_year as number) ?? null,
        preferred_countries: many(labels.country, sp.preferred_countries as string[] | null),
        preferred_roles: many(labels.nursing_role, sp.preferred_roles as string[] | null),
        preferred_employment_types: many(labels.employment_type, sp.preferred_employment_types as string[] | null),
        preferred_work_settings: many(labels.work_setting, sp.preferred_work_settings as string[] | null),
      }
    : null;

  return {
    full_name: u?.full_name ?? null,
    professional_title: u?.professional_title ?? null,
    bio: u?.bio ?? null,
    country: u?.country ?? null,
    profile_photo: u?.profile_photo ?? null,
    // The reason an employer would prefer UNN over a generic board.
    verification_status: u?.verification_status ?? "unverified",
    role: u?.role ?? null,
    education: p?.education ?? [],
    experience: p?.experience ?? [],
    skills: p?.skills ?? [],
    languages: p?.languages ?? [],
    certificates: p?.certificates ?? [],
    seeker,
    captured_at: new Date().toISOString(),
  };
}

/** Shape of the apply payload, shared by the wrapper and the implementation. */
type ApplyInput = {
  coverNote?: string;
  resumeId?: string; // built resume (cns_resumes)
  resumeFileId?: string; // uploaded CV (cns_resume_files)
  answers?: { questionId: string; questionText: string; answer: string }[];
  declarationAccepted: boolean;
};

/**
 * A Server Action must never be allowed to THROW.
 *
 * Every failure this function anticipates is already returned as { error }, and
 * ApplyPanel renders those inline. An UNANTICIPATED throw behaves completely
 * differently: React replaces the whole route with "Application error: a
 * server-side exception has occurred" and a digest, the message is stripped in
 * production, and the applicant is left on a dead page with no way to retry —
 * on the single screen the entire job board exists to funnel them to.
 *
 * That is what was happening here. The insert never ran (no application rows
 * were created), so the throw was upstream of it, and the digest gave nothing
 * to work from.
 *
 * So: catch everything, log it (this is what puts a readable message in the
 * runtime log instead of an opaque digest), and hand the applicant a sentence
 * plus a working page. The sentence comes from userMessage(): a known failure
 * (timeout, network, permission) is named, but raw database text is not shown
 * — the full detail is in the log line, tagged "jobs:applyToJob".
 */
export async function applyToJob(jobId: string, input: ApplyInput): Promise<ActionResult> {
  try {
    return await applyToJobImpl(jobId, input);
  } catch (err) {
    logError("jobs:applyToJob", err, { jobId });
    return { error: `Could not submit your application: ${userMessage(err)}` };
  }
}

/** At most five questions exist per job (DB trigger); allow headroom, refuse floods. */
const MAX_ANSWERS = 20;

/** Validate the apply payload. Blank optional fields become null, never "". */
function validateApplyInput(jobId: unknown, input: ApplyInput): Valid<{
  jobId: string;
  coverNote: string | null;
  resumeId: string | null;
  resumeFileId: string | null;
  answers: { questionId: string; questionText: string; answer: string | null }[];
}> {
  if (!input || typeof input !== "object") return { ok: false, error: "Nothing to submit." };
  const v = all({
    jobId: reqId(jobId, "Job"),
    coverNote: optText(input.coverNote, "Cover note", LIMITS.message, { multiline: true }),
    resumeId: optId(input.resumeId, "CV"),
    resumeFileId: optId(input.resumeFileId, "CV"),
  });
  if (!v.ok) return v;
  const raw = input.answers ?? [];
  if (!Array.isArray(raw)) return { ok: false, error: "Screening answers are not valid." };
  if (raw.length > MAX_ANSWERS) return { ok: false, error: "Too many screening answers." };
  const answers: { questionId: string; questionText: string; answer: string | null }[] = [];
  for (const a of raw) {
    if (!a || typeof a !== "object") return { ok: false, error: "Screening answers are not valid." };
    const r = all({
      questionId: reqId(a.questionId, "Question"),
      questionText: reqText(a.questionText, "Question", LIMITS.bio),
      // An optional question left blank is stored as null, not "" — the row is
      // kept so the employer still sees the question was asked.
      answer: optText(a.answer, "Answer", LIMITS.comment, { multiline: true }),
    });
    if (!r.ok) return r;
    answers.push(r.value);
  }
  return { ok: true, value: { ...v.value, answers } };
}

async function applyToJobImpl(
  rawJobId: string,
  rawInput: ApplyInput
): Promise<ActionResult> {
  const valid = validateApplyInput(rawJobId, rawInput);
  if (!valid.ok) return { error: valid.error };
  const { jobId, ...input } = valid.value;
  const declarationAccepted = bool(rawInput.declarationAccepted);

  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  // §6.2 step 6: the declaration is a required step, so it is enforced here
  // rather than only being a disabled button in the UI.
  if (!declarationAccepted) {
    return { error: "Please accept the applicant declaration before submitting." };
  }

  const limited = await checkLimit("apply", user.id);
  if (limited) return limited;

  const supabase = await createClient();

  // Only a live job accepts applications (§12.2). RLS enforces this too; the
  // check here exists to return a sentence rather than a constraint error.
  const { data: job, error: jobError } = await supabase
    .from("cns_jobs")
    .select("id,status,application_deadline,title,employer_id")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) logError("jobs:applyToJob:job", jobError, { jobId });
  if (!job) return { error: "Job not found" };
  if (job.status !== "active") return { error: "This role is no longer accepting applications." };
  if (job.application_deadline && new Date(job.application_deadline as string) < new Date()) {
    return { error: "Applications for this role have closed." };
  }

  // Required screening questions must actually be answered.
  const { data: questions, error: questionsError } = await supabase
    .from("cns_job_screening_questions")
    .select("id,question,is_required")
    .eq("job_id", jobId);
  if (questionsError) logError("jobs:applyToJob:questions", questionsError, { jobId });

  const answered = new Map(input.answers.map((a) => [a.questionId, a.answer ?? ""]));
  const unanswered = (questions ?? []).filter(
    (q) => q.is_required && !answered.get(q.id as string)
  );
  if (unanswered.length) {
    return { error: `Please answer: ${unanswered.map((q) => q.question).join(", ")}` };
  }

  // The attached CV must be the applicant's own. The employer's CV access
  // (lib/cns/application-resume-access.ts) trusts whatever an application
  // references, so an unchecked id here let an applicant attach — and an
  // employer then download — another member's CV.
  if (input.resumeFileId) {
    const { data: own, error: ownError } = await supabase
      .from("cns_resume_files")
      .select("id")
      .eq("id", input.resumeFileId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (ownError) logError("jobs:applyToJob:resumeFile", ownError, { jobId });
    if (!own) return { error: "Please attach one of your own CVs." };
  }
  if (input.resumeId) {
    const { data: own, error: ownError } = await supabase
      .from("cns_resumes")
      .select("id")
      .eq("id", input.resumeId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (ownError) logError("jobs:applyToJob:resume", ownError, { jobId });
    if (!own) return { error: "Please attach one of your own CVs." };
  }

  const snapshot = await buildSnapshot(user.id);

  const { data: created, error } = await supabase
    .from("cns_job_applications")
    .insert({
      job_id: jobId,
      applicant_id: user.id,
      resume_id: input.resumeId ?? null,
      resume_file_id: input.resumeFileId ?? null,
      cover_note: input.coverNote ?? null,
      profile_snapshot: snapshot,
      declaration_accepted_at: new Date().toISOString(),
      status: "applied",
    })
    .select("id")
    .single();

  if (error) {
    // The unique (job_id, applicant_id) constraint is the real guard against
    // double-apply; surface it as a message rather than a database error.
    if (error.code === "23505") return { error: "You have already applied to this job." };
    return actionError("jobs:applyToJob:insert", error, undefined, { jobId });
  }

  // Answers carry the question TEXT, not just its id: an employer editing a
  // question later must not change what the candidate appears to have been
  // asked.
  if (input.answers.length) {
    const { error: answersError } = await supabase.from("cns_application_answers").insert(
      input.answers.map((a) => ({
        application_id: created.id,
        question_id: a.questionId,
        question_text: a.questionText,
        answer: a.answer,
      }))
    );
    if (answersError) {
      logError("jobs:applyToJob:answers", answersError, { jobId, applicationId: created.id });
    }
  }

  const { error: historyError } = await supabase.from("cns_application_status_history").insert({
    application_id: created.id,
    status: "applied",
    actor_id: user.id,
  });
  if (historyError) {
    logError("jobs:applyToJob:history", historyError, { applicationId: created.id });
  }

  // Tell the employer. In-app always; by email too once CNS holds a Resend
  // key, which is the switch that also turns on applicant status emails.
  const { data: members, error: membersError } = await supabase
    .from("cns_employer_members")
    .select("user_id")
    .eq("employer_id", job.employer_id as string)
    .eq("status", "approved");
  if (membersError) logError("jobs:applyToJob:notifyMembers", membersError, { jobId });
  if (members?.length) {
    await notifyUsers(
      members.map((m) => ({
        userId: m.user_id as string,
        type: "cns_job_application_received",
        message: `New application for ${job.title}.`,
        referenceId: created.id as string,
        email: {
          subject: `New application — ${job.title}`,
          heading: `You have a new applicant for ${job.title}`,
          body:
            "Someone has applied through Nerusalem. Open your inbox to read their profile, see how " +
            "well they fit the role, and shortlist them if they look right.",
          ctaLabel: "Review the application",
          ctaHref: `/employer/${job.employer_id}/applications`,
        },
      }))
    );
  }

  revalidatePath("/applications");
  return { ok: true };
}

/**
 * Withdraw, through the definer function rather than a table update.
 *
 * This used to be a plain UPDATE relying on the "cns applications withdraw"
 * policy for ownership. That policy was
 * `for update using (applicant_id = auth.uid())` with no WITH CHECK and no
 * column restriction — RLS is row-level, so it granted the candidate EVERY
 * column of their own application. Verified against the live schema: a
 * candidate could set their own status to 'selected', overwrite the employer's
 * private note, and rewrite the frozen profile_snapshot, including the
 * verification_status the employer's list draws its "verified" badge from.
 *
 * UHN 0002 dropped that policy, revoked UPDATE on the table from
 * `authenticated`, and added cns_withdraw_application(), which checks
 * ownership, is idempotent, and writes the status-history row. This call site
 * has to change with it or withdrawal returns "permission denied".
 */
export async function withdrawApplication(applicationId: string): Promise<ActionResult> {
  const id = reqId(applicationId, "Application");
  if (!id.ok) return { error: id.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cns_withdraw_application", {
    p_application_id: id.value,
  });
  if (error) return actionError("jobs:withdrawApplication", error);
  revalidatePath("/jobs/applications");
  return { ok: true };
}

/** How a status change reads to the applicant. Written for them, not the employer. */
// Keyed on the DB status vocabulary (see cns_set_application_status). A key
// that no status can hold produces silence — the candidate never hears back.
const APPLICANT_MESSAGE: Record<string, string> = {
  under_review: "Your application has been opened by the employer.",
  shortlisted: "You have been shortlisted. The employer now has your contact details.",
  interview: "You have been invited to interview.",
  selected: "You have been selected for this role.",
  not_selected: "The employer is not taking your application forward.",
};

/** Subject lines. Specific enough to be read in a notification preview. */
const APPLICANT_STATUS_SUBJECT: Record<string, string> = {
  shortlisted: "you have been shortlisted",
  interview: "interview invitation",
  selected: "you have been selected",
  not_selected: "application update",
};

const APPLICANT_STATUS_HEADING: Record<string, string> = {
  shortlisted: "You have been shortlisted",
  interview: "You have been invited to interview",
  selected: "You have been selected",
  // Named plainly. A rejection dressed up as "an update on your journey" is
  // read as an offer, and that is a worse minute than the honest sentence.
  not_selected: "You have not been taken forward this time",
};

export async function setApplicationStatus(applicationId: string, status: string, note?: string): Promise<ActionResult> {
  const v = all({
    applicationId: reqId(applicationId, "Application"),
    status: reqOneOf(status, "Status", APPLICATION_STATUSES),
    // Blank becomes null, which the function's coalesce() reads as "keep the
    // existing note" — "" would have wiped it.
    note: optText(note, "Note", LIMITS.comment, { multiline: true }),
  });
  if (!v.ok) return { error: v.error };
  applicationId = v.value.applicationId;
  status = v.value.status;

  const supabase = await createClient();
  // Definer function: lets an employer move status without holding a general
  // UPDATE grant, which would also let them edit profile_snapshot.
  const { error } = await supabase.rpc("cns_set_application_status", {
    p_application_id: applicationId,
    p_status: status,
    p_note: v.value.note,
  });
  if (error) return actionError("jobs:setApplicationStatus", error);

  // Tell the applicant. Silence here is the worst part of applying for jobs,
  // and a status the candidate never sees is the same as no status at all.
  const { data: app, error: appError } = await supabase
    .from("cns_job_applications")
    .select("applicant_id,job_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (appError) logError("jobs:setApplicationStatus:notify", appError, { applicationId });

  if (app?.applicant_id && APPLICANT_MESSAGE[status]) {
    const { data: job } = await supabase
      .from("cns_jobs")
      .select("title,slug")
      .eq("id", app.job_id as string)
      .maybeSingle();

    const title = (job?.title as string) ?? "A role";

    await notifyUser({
      userId: app.applicant_id as string,
      type: `cns_application_${status}`,
      message: `${title} — ${APPLICANT_MESSAGE[status]}`,
      referenceId: applicationId,
      // Every stage is worth an email except the one nobody wants pushed at
      // them: 'under_review' fires the moment an employer opens the card, and
      // mailing that would train people to ignore the ones that matter.
      email:
        status === "under_review"
          ? null
          : {
              subject: `${title} — ${APPLICANT_STATUS_SUBJECT[status] ?? "application update"}`,
              heading: APPLICANT_STATUS_HEADING[status] ?? "Your application has an update",
              body: `${APPLICANT_MESSAGE[status]} (${title})`,
              ctaLabel: "View your applications",
              ctaHref: "/applications",
            },
    });
  }

  revalidatePath("/employer");
  revalidatePath("/applications");
  return { ok: true };
}

export async function toggleSaveJob(jobId: string, save: boolean): Promise<ActionResult> {
  const id = reqId(jobId, "Job");
  if (!id.ok) return { error: id.error };
  jobId = id.value;
  save = bool(save);
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supabase = await createClient();

  if (save) {
    const { error: saveError } = await supabase.from("cns_job_saves").insert({ user_id: user.id, job_id: jobId });
    if (saveError) logError("jobs:toggleSaveJob:save", saveError, { jobId });
  } else {
    const { error: unsaveError } = await supabase
      .from("cns_job_saves")
      .delete()
      .eq("user_id", user.id)
      .eq("job_id", jobId);
    if (unsaveError) logError("jobs:toggleSaveJob:unsave", unsaveError, { jobId });
  }
  revalidatePath("/jobs");
  return { ok: true };
}

/* ---------------------------- screening questions -------------------------- */

/**
 * Replace a job's screening questions (blueprint §7.3, max five).
 *
 * Replace rather than diff: questions are few and editing one in place would
 * silently change what past applicants appear to have been asked. Answers
 * already submitted keep their own copy of the text, so rewriting the set here
 * cannot rewrite history.
 */
export async function setScreeningQuestions(
  jobId: string,
  questions: {
    question: string;
    question_type: "short_answer" | "yes_no" | "number";
    is_required: boolean;
    /** yes_no only: the answer that clears the bar. */
    knockout_expected?: "yes" | "no" | null;
    /** number only: the minimum answer that clears the bar. */
    knockout_min?: number | null;
  }[]
): Promise<ActionResult> {
  const id = reqId(jobId, "Job");
  if (!id.ok) return { error: id.error };
  jobId = id.value;
  if (!Array.isArray(questions)) return { error: "Screening questions are not valid." };
  if (questions.length > 50) return { error: "Too many screening questions." };

  type CleanQuestion = {
    question: string;
    question_type: (typeof QUESTION_TYPES)[number];
    is_required: boolean;
    knockout_expected: "yes" | "no" | null;
    knockout_min: number | null;
  };
  const kept: CleanQuestion[] = [];
  for (const q of questions) {
    if (!q || typeof q !== "object") return { error: "Screening questions are not valid." };
    const text = optText(q.question, "Question", LIMITS.short);
    if (!text.ok) return { error: text.error };
    if (text.value === null) continue; // blank rows are dropped, as before
    const type = reqOneOf(q.question_type, "Answer type", QUESTION_TYPES);
    if (!type.ok) return { error: type.error };
    if (q.knockout_min != null && typeof q.knockout_min !== "number") {
      return { error: "“Meets criteria at” must be a number." };
    }
    // A rule is only stored against the type it can apply to. The database
    // has a CHECK saying the same thing; normalising here turns what would
    // be a raw constraint error into a rule that is simply dropped when the
    // employer switches a question's answer type after setting one.
    const expected = type.value === "yes_no" ? optOneOf(q.knockout_expected, "Expected answer", YES_NO) : okValue(null);
    if (!expected.ok) return { error: expected.error };
    kept.push({
      question: text.value,
      question_type: type.value,
      is_required: bool(q.is_required),
      knockout_expected: expected.value,
      knockout_min:
        type.value === "number" && q.knockout_min != null && Number.isFinite(q.knockout_min)
          ? q.knockout_min
          : null,
    });
  }
  const clean = kept.slice(0, 5); // the database enforces this too, via a trigger

  const supabase = await createClient();

  // Refuse what the column cannot hold BEFORE touching anything. knockout_min
  // is numeric(6,1), so 1000000 failed the insert — after the delete below had
  // already emptied the job's questions (E-B-SCR006).
  if (clean.some((q) => q.knockout_min != null && Math.abs(q.knockout_min) >= 100000)) {
    return { error: "“Meets criteria at” must be below 100,000." };
  }

  // Delete-then-insert is two statements, not a transaction. Keep what is
  // there now so a failed insert puts it back instead of leaving the job with
  // no questions at all.
  const { data: previous, error: prevError } = await supabase
    .from("cns_job_screening_questions")
    .select("job_id,question,question_type,is_required,knockout_expected,knockout_min,position")
    .eq("job_id", jobId);
  if (prevError) logError("jobs:setScreeningQuestions:read", prevError, { jobId });

  const { error: delError } = await supabase
    .from("cns_job_screening_questions")
    .delete()
    .eq("job_id", jobId);
  if (delError) return actionError("jobs:setScreeningQuestions:delete", delError, undefined, { jobId });

  if (clean.length) {
    const { error } = await supabase.from("cns_job_screening_questions").insert(
      clean.map((q, i) => ({ ...q, job_id: jobId, position: i }))
    );
    if (error) {
      logError("jobs:setScreeningQuestions:insert", error, { jobId });
      if (previous?.length) {
        const { error: restoreError } = await supabase.from("cns_job_screening_questions").insert(previous);
        if (restoreError) logError("jobs:setScreeningQuestions:restore", restoreError, { jobId });
      }
      return { error: `Your questions were not saved: ${userMessage(error)}` };
    }
  }

  revalidatePath(`/employer`);
  return { ok: true };
}

/* --------------------------------- reports -------------------------------- */

/** Report a job (blueprint §9.3). */
export async function reportJob(
  jobId: string,
  reason: string,
  detail?: string
): Promise<ActionResult> {
  const v = all({
    jobId: reqId(jobId, "Job"),
    reason: reqOneOf(reason, "Reason", REPORT_REASONS),
    detail: optText(detail, "Detail", LIMITS.comment, { multiline: true }),
  });
  if (!v.ok) return { error: v.error };

  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  const limited = await checkLimit("report", user.id);
  if (limited) return limited;

  const supabase = await createClient();
  const { error } = await supabase.from("cns_job_reports").insert({
    job_id: v.value.jobId,
    reporter_id: user.id,
    reason: v.value.reason,
    detail: v.value.detail,
  });
  if (error) return actionError("jobs:reportJob", error);
  return { ok: true };
}

/**
 * A short-lived link to the CV a candidate attached to their application.
 *
 * Minted on demand rather than presigned when the pipeline renders: a page of
 * thirty applicants would otherwise mint thirty signed URLs on every load, all
 * expiring in ten minutes whether or not anyone clicked one.
 *
 * Entitlement lives in lib/cns/application-resume-access.ts and is checked
 * there before anything is read — see that file for why this is not left to
 * RLS.
 */
export async function getApplicationResumeUrl(
  applicationId: string
): Promise<ActionResult & { url?: string; href?: string; fileName?: string; title?: string }> {
  const id = reqId(applicationId, "Application");
  if (!id.ok) return { error: id.error };
  const target = await getApplicationResumeTarget(id.value);

  switch (target.kind) {
    case "file":
      return { ok: true, url: target.url, fileName: target.fileName };
    case "built":
      return { ok: true, href: target.href, title: target.title };
    case "unshared":
      return {
        error: `"${target.title}" is a resume built in Nerusalem and the candidate has not enabled its share link. Ask them to turn on sharing from their Resume page.`,
      };
    default:
      return { error: "No CV is attached to this application." };
  }
}

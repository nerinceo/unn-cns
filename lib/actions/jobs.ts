"use server";


import type { ActionResult } from "@/lib/actions/result";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { checkLimit } from "@/lib/ratelimit";

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
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  const supabase = await createClient();
  const slug = `${slugify(input.name)}-${Math.random().toString(36).slice(2, 6)}`;

  const { data, error } = await supabase
    .from("cns_employers")
    .insert({ ...input, slug, created_by: user.id, status: "pending" })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // The registrant becomes an approved OWNER immediately. The gate that matters
  // is the employer's own status: 'pending' blocks publishing until staff
  // approve, so nothing reaches the public board regardless.
  await supabase.from("cns_employer_members").insert({
    employer_id: data.id,
    user_id: user.id,
    role: "owner",
    status: "approved",
  });

  revalidatePath("/employer");
  return { id: data.id as string };
}

/* ----------------------------------- jobs --------------------------------- */

export async function saveJob(
  employerId: string,
  input: Record<string, unknown>,
  jobId?: string
): Promise<ActionResult & { jobId?: string; id?: string; slug?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  // Only new postings are limited; editing a draft repeatedly is normal work.
  if (!jobId) {
    const limited = await checkLimit("post", user.id);
    if (limited) return limited;
  }

  const supabase = await createClient();

  const payload = { ...input, employer_id: employerId, updated_at: new Date().toISOString() };

  if (jobId) {
    const { error } = await supabase.from("cns_jobs").update(payload).eq("id", jobId);
    if (error) return { error: error.message };
    revalidatePath(`/employer/${employerId}`);
    return { id: jobId };
  }

  const { data, error } = await supabase
    .from("cns_jobs")
    .insert({
      ...payload,
      slug: `${slugify(String(input.title ?? "job"))}-${Math.random().toString(36).slice(2, 7)}`,
      created_by: user.id,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
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
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("cns_jobs")
    .select("title,description,country,nursing_role,work_setting,application_deadline,employer_id")
    .eq("id", jobId)
    .maybeSingle();
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

  const { data: employer } = await supabase
    .from("cns_employers")
    .select("status")
    .eq("id", job.employer_id as string)
    .maybeSingle();
  if (employer?.status !== "approved")
    return { error: "Your organisation is still awaiting approval." };

  const { error } = await supabase
    .from("cns_jobs")
    .update({ status: "submitted", updated_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) return { error: error.message };

  revalidatePath(`/employer/${job.employer_id}/jobs`);
  revalidatePath("/admin/jobs");
  return { ok: true };
}

/** Employer pauses or closes a live job. Neither needs admin involvement. */
export async function setJobLifecycle(jobId: string, next: "paused" | "active" | "closed"): Promise<ActionResult> {
  const supabase = await createClient();

  // Resuming a paused job returns it to 'active' without re-review; it was
  // already approved once and its content has not changed.
  const { error } = await supabase
    .from("cns_jobs")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("status", next === "active" ? ["paused"] : ["active", "paused"]);
  if (error) return { error: error.message };

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

  const { data: u } = await supabase
    .from("users")
    .select("full_name,professional_title,bio,country,profile_photo,verification_status,role")
    .eq("id", userId)
    .maybeSingle();

  const { data: p } = await supabase
    .from("profiles")
    .select("education,experience,skills,languages,certificates")
    .eq("user_id", userId)
    .maybeSingle();

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
    captured_at: new Date().toISOString(),
  };
}

export async function applyToJob(
  jobId: string,
  input: {
    coverNote?: string;
    resumeId?: string;          // built resume (cns_resumes)
    resumeFileId?: string;      // uploaded CV (cns_resume_files)
    answers?: { questionId: string; questionText: string; answer: string }[];
    declarationAccepted: boolean;
  }
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  // §6.2 step 6: the declaration is a required step, so it is enforced here
  // rather than only being a disabled button in the UI.
  if (!input.declarationAccepted) {
    return { error: "Please accept the applicant declaration before submitting." };
  }

  const limited = await checkLimit("apply", user.id);
  if (limited) return limited;

  const supabase = await createClient();

  // Only a live job accepts applications (§12.2). RLS enforces this too; the
  // check here exists to return a sentence rather than a constraint error.
  const { data: job } = await supabase
    .from("cns_jobs")
    .select("id,status,application_deadline,title,employer_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { error: "Job not found" };
  if (job.status !== "active") return { error: "This role is no longer accepting applications." };
  if (job.application_deadline && new Date(job.application_deadline as string) < new Date()) {
    return { error: "Applications for this role have closed." };
  }

  // Required screening questions must actually be answered.
  const { data: questions } = await supabase
    .from("cns_job_screening_questions")
    .select("id,question,is_required")
    .eq("job_id", jobId);

  const answered = new Map((input.answers ?? []).map((a) => [a.questionId, a.answer?.trim() ?? ""]));
  const unanswered = (questions ?? []).filter(
    (q) => q.is_required && !answered.get(q.id as string)
  );
  if (unanswered.length) {
    return { error: `Please answer: ${unanswered.map((q) => q.question).join(", ")}` };
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
    return { error: error.message };
  }

  // Answers carry the question TEXT, not just its id: an employer editing a
  // question later must not change what the candidate appears to have been
  // asked.
  if (input.answers?.length) {
    await supabase.from("cns_application_answers").insert(
      input.answers.map((a) => ({
        application_id: created.id,
        question_id: a.questionId,
        question_text: a.questionText,
        answer: a.answer,
      }))
    );
  }

  await supabase.from("cns_application_status_history").insert({
    application_id: created.id,
    status: "applied",
    actor_id: user.id,
  });

  // Tell the employer. In-app only — CNS holds no email credentials.
  const { data: members } = await supabase
    .from("cns_employer_members")
    .select("user_id")
    .eq("employer_id", job.employer_id as string)
    .eq("status", "approved");
  if (members?.length) {
    await supabase.from("notifications").insert(
      members.map((m) => ({
        user_id: m.user_id,
        notification_type: "cns_job_application_received",
        message: `New application for ${job.title}.`,
        reference_id: created.id,
      }))
    );
  }

  revalidatePath("/applications");
  return { ok: true };
}

export async function withdrawApplication(applicationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("cns_job_applications")
    .update({ status: "withdrawn", status_changed_at: new Date().toISOString() })
    .eq("id", applicationId);
  if (error) return { error: error.message };
  revalidatePath("/jobs/applications");
  return { ok: true };
}

/** How a status change reads to the applicant. Written for them, not the employer. */
const APPLICANT_MESSAGE: Record<string, string> = {
  viewed: "Your application has been opened by the employer.",
  shortlisted: "You have been shortlisted. The employer now has your contact details.",
  interview: "You have been invited to interview.",
  offered: "You have received an offer.",
  rejected: "The employer is not taking your application forward.",
};

export async function setApplicationStatus(applicationId: string, status: string, note?: string): Promise<ActionResult> {
  const supabase = await createClient();
  // Definer function: lets an employer move status without holding a general
  // UPDATE grant, which would also let them edit profile_snapshot.
  const { error } = await supabase.rpc("cns_set_application_status", {
    p_application_id: applicationId,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) return { error: error.message };

  // Tell the applicant. Silence here is the worst part of applying for jobs,
  // and a status the candidate never sees is the same as no status at all.
  const { data: app } = await supabase
    .from("cns_job_applications")
    .select("applicant_id,job_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (app?.applicant_id && APPLICANT_MESSAGE[status]) {
    const { data: job } = await supabase
      .from("cns_jobs")
      .select("title")
      .eq("id", app.job_id as string)
      .maybeSingle();

    await supabase.from("notifications").insert({
      user_id: app.applicant_id,
      notification_type: `cns_application_${status}`,
      message: `${job?.title ?? "A role"} — ${APPLICANT_MESSAGE[status]}`,
      reference_id: applicationId,
    });
  }

  revalidatePath("/employer");
  revalidatePath("/applications");
  return { ok: true };
}

export async function toggleSaveJob(jobId: string, save: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supabase = await createClient();

  if (save) {
    await supabase.from("cns_job_saves").insert({ user_id: user.id, job_id: jobId });
  } else {
    await supabase.from("cns_job_saves").delete().eq("user_id", user.id).eq("job_id", jobId);
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
  questions: { question: string; question_type: "short_answer" | "yes_no"; is_required: boolean }[]
): Promise<ActionResult> {
  const supabase = await createClient();

  const clean = questions
    .map((q) => ({ ...q, question: q.question.trim() }))
    .filter((q) => q.question.length > 0)
    .slice(0, 5); // the database enforces this too, via a trigger

  const { error: delError } = await supabase
    .from("cns_job_screening_questions")
    .delete()
    .eq("job_id", jobId);
  if (delError) return { error: delError.message };

  if (clean.length) {
    const { error } = await supabase.from("cns_job_screening_questions").insert(
      clean.map((q, i) => ({ ...q, job_id: jobId, position: i }))
    );
    if (error) return { error: error.message };
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
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  const limited = await checkLimit("report", user.id);
  if (limited) return limited;

  const supabase = await createClient();
  const { error } = await supabase.from("cns_job_reports").insert({
    job_id: jobId,
    reporter_id: user.id,
    reason,
    detail: detail ?? null,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

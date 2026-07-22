"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

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
}) {
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
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };
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

export async function publishJob(jobId: string, publish: boolean) {
  const supabase = await createClient();

  if (publish) {
    // Refuse to publish anything Google would treat as low quality, since a
    // board of thin or undated listings risks the whole site being delisted.
    const { data: job } = await supabase
      .from("cns_jobs")
      .select("title,description,country,application_deadline,employer_id")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) return { error: "Job not found" };

    const missing: string[] = [];
    if (!job.title?.trim()) missing.push("title");
    if (!job.description || job.description.trim().length < 100)
      missing.push("a fuller description (at least 100 characters)");
    if (!job.country) missing.push("country");
    if (!job.application_deadline) missing.push("an application deadline");
    if (missing.length) return { error: `Add ${missing.join(", ")} before publishing.` };

    const { data: employer } = await supabase
      .from("cns_employers")
      .select("status")
      .eq("id", job.employer_id as string)
      .maybeSingle();
    if (employer?.status !== "approved")
      return { error: "Your organisation is still awaiting approval." };
  }

  const { error } = await supabase
    .from("cns_jobs")
    .update({
      status: publish ? "published" : "closed",
      published_at: publish ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
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

export async function applyToJob(jobId: string, input: { coverNote?: string; resumeId?: string }) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supabase = await createClient();

  const snapshot = await buildSnapshot(user.id);

  const { error } = await supabase.from("cns_job_applications").insert({
    job_id: jobId,
    applicant_id: user.id,
    resume_id: input.resumeId ?? null,
    cover_note: input.coverNote ?? null,
    profile_snapshot: snapshot,
  });

  if (error) {
    // The unique (job_id, applicant_id) constraint is the real guard against
    // double-apply; surface it as a message rather than a database error.
    if (error.code === "23505") return { error: "You have already applied to this job." };
    return { error: error.message };
  }

  revalidatePath("/jobs/applications");
  return { ok: true };
}

export async function withdrawApplication(applicationId: string) {
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

export async function setApplicationStatus(applicationId: string, status: string, note?: string) {
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

export async function toggleSaveJob(jobId: string, save: boolean) {
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

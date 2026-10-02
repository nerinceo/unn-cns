import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { presignDocRead } from "@/lib/r2/docs";

/**
 * Reading the CV a candidate attached to a job application.
 *
 * Modelled deliberately on lib/cns/employer-doc-access.ts, and for the same
 * reason it exists: entitlement is decided FIRST, explicitly, and only then is
 * the row read with service role. That file records what happens otherwise —
 * reading with the user's own client and trusting RLS to filter handed every
 * employer's registration document to anyone who asked, because RLS on
 * cns_employers intentionally exposes the public profile row.
 *
 * A CV is more sensitive than a job posting: it carries a nurse's employment
 * history and often their address. Only the employer the candidate actually
 * applied to may open it.
 *
 * Contact details are NOT part of this. Those stay gated on the application
 * reaching shortlisted/interview/selected, because the apply screen promises
 * the candidate in writing that "my email and phone number are not shared
 * unless the employer shortlists me". A CV is different: the candidate
 * attached it to this specific application, and the employer needs it to
 * decide whether to shortlist at all.
 */

export type ResumeTarget =
  | { kind: "file"; url: string; fileName: string }
  | { kind: "built"; href: string; title: string }
  | { kind: "none" }
  | { kind: "unshared"; title: string };

/**
 * True when the caller may read the CV attached to this application: an
 * approved member of the employer that owns the job, or platform staff.
 */
export async function canReadApplicationResume(applicationId: string): Promise<boolean> {
  const supabase = await createClient();
  const admin = createAdminClient();

  // Which employer owns the job this application is for? Read with service
  // role: this is establishing the FACT, not granting access. The permission
  // question is asked separately below.
  const { data: app } = await admin
    .from("cns_job_applications")
    .select("id, job:job_id(employer_id)")
    .eq("id", applicationId)
    .maybeSingle();

  const job = app?.job as { employer_id?: string } | { employer_id?: string }[] | null;
  const employerId = (Array.isArray(job) ? job[0]?.employer_id : job?.employer_id) ?? null;
  if (!employerId) return false;

  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return false;

  // The user's OWN client on purpose — the membership policy lets a user read
  // their own row, which is exactly the question being asked, and keeps this
  // from becoming a service-role check that trusts its own input.
  const { data: membership } = await supabase
    .from("cns_employer_members")
    .select("id")
    .eq("employer_id", employerId)
    .eq("user_id", userId)
    .eq("status", "approved")
    .maybeSingle();
  if (membership) return true;

  const { data: staff } = await supabase.rpc("cns_is_staff");
  return Boolean(staff);
}

/**
 * Resolve what the employer should actually open for this application.
 *
 * Two kinds of CV exist. An uploaded file lives in R2 and is served as a
 * short-lived presigned link, so the storage key never reaches the browser and
 * the URL cannot be forwarded indefinitely. A resume built inside UNN is a
 * database record, reachable through its existing public share route.
 */
export async function getApplicationResumeTarget(applicationId: string): Promise<ResumeTarget> {
  if (!(await canReadApplicationResume(applicationId))) return { kind: "none" };

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("cns_job_applications")
    .select("resume_file_id, resume_id, applicant_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (!app) return { kind: "none" };

  if (app.resume_file_id) {
    const { data: file } = await admin
      .from("cns_resume_files")
      .select("storage_key, file_name")
      .eq("id", app.resume_file_id as string)
      // Only the applicant's own file: an application row can reference any id.
      .eq("user_id", app.applicant_id as string)
      .maybeSingle();

    if (file?.storage_key) {
      const fileName = (file.file_name as string) ?? "cv";
      return {
        kind: "file",
        url: await presignDocRead(file.storage_key as string, fileName),
        fileName,
      };
    }
  }

  if (app.resume_id) {
    const { data: built } = await admin
      .from("cns_resumes")
      .select("title, public_token")
      .eq("id", app.resume_id as string)
      .eq("user_id", app.applicant_id as string)
      .maybeSingle();

    if (built) {
      const title = (built.title as string) ?? "Resume";
      // Sharing is the candidate's own switch. If it is off we say so rather
      // than minting a token on their behalf — turning on someone's public
      // share link without asking is not ours to do.
      return built.public_token
        ? { kind: "built", href: `/r/${built.public_token as string}`, title }
        : { kind: "unshared", title };
    }
  }

  return { kind: "none" };
}

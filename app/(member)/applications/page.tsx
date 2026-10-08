import Link from "next/link";
import { Send, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils/cn";
import { WithdrawButton } from "@/components/jobs/WithdrawButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Applications — Central Nerusalem Space" };

/**
 * What each status means to the applicant.
 *
 * Employers move applications through this pipeline; the wording here is
 * written for the nurse, not the recruiter — "Under review" rather than
 * "viewed", because the internal label is not what a candidate needs to read.
 */
// Keyed on the DB status vocabulary. An unknown status falls through to the
// 'applied' entry below, so a drift here degrades to a wrong label rather than
// a crash — but it drifted once (submitted/viewed/offered/rejected) and every
// real row then showed the fallback, so keep this in step with the migration.
const STATUS: Record<string, { label: string; hint: string; tone: "neutral" | "good" | "bad" }> = {
  applied: { label: "Applied", hint: "Waiting for the employer to review.", tone: "neutral" },
  under_review: { label: "Under review", hint: "The employer has opened your application.", tone: "neutral" },
  shortlisted: { label: "Shortlisted", hint: "They have your contact details and may be in touch.", tone: "good" },
  interview: { label: "Interview", hint: "You have been invited to interview.", tone: "good" },
  selected: { label: "Selected", hint: "You have been selected for this role.", tone: "good" },
  not_selected: { label: "Not selected", hint: "The employer is not taking this forward.", tone: "bad" },
  withdrawn: { label: "Withdrawn", hint: "You withdrew this application.", tone: "bad" },
};

/** Roles with no public page any more. */
const GONE = new Set(["removed", "rejected", "draft", "submitted", "changes_requested"]);
/** Roles that still have a page but no longer take applications. */
const ENDED_LABEL: Record<string, string> = { paused: "Paused", closed: "Closed", expired: "Closed" };

export default async function MyApplicationsPage() {
  const supabase = await createClient();

  // RLS scopes this to the caller's own applications.
  const { data: applications } = await supabase
    .from("cns_job_applications")
    .select("id,status,status_changed_at,created_at,cover_note,job_id")
    .order("created_at", { ascending: false });

  const jobIds = (applications ?? []).map((a) => a.job_id as string);
  const { data: visibleJobs } = jobIds.length
    ? await supabase
        .from("cns_jobs")
        .select("id,slug,title,city,country,employer_id,status")
        .in("id", jobIds)
    : { data: [] };

  // RLS shows only LIVE roles, so an application to a role the employer had
  // paused or closed read "Role removed / Employer" (found 2026-10-08). These
  // are roles this member applied to — the ids come from her own applications
  // above — so their public columns are read with the service role.
  const seen = new Set((visibleJobs ?? []).map((j) => j.id as string));
  const hidden = jobIds.filter((id) => !seen.has(id));
  const { data: hiddenJobs } = hidden.length
    ? await createAdminClient()
        .from("cns_jobs")
        .select("id,slug,title,city,country,employer_id,status")
        .in("id", hidden)
    : { data: [] };
  const jobs = [...(visibleJobs ?? []), ...(hiddenJobs ?? [])];

  const employerIds = Array.from(new Set(jobs.map((j) => j.employer_id as string)));
  const { data: employers } = employerIds.length
    ? await createAdminClient().from("cns_employers").select("id,name").in("id", employerIds)
    : { data: [] };

  const jobById = new Map((jobs ?? []).map((j) => [j.id as string, j]));
  const empById = new Map((employers ?? []).map((e) => [e.id as string, e]));

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <Send className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold sm:text-3xl">My Applications</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Every role you have applied for, and where each one stands.
        </p>
      </header>

      {!applications?.length ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No applications yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Roles you apply for will appear here with their status.
          </p>
          <Link
            href="/jobs"
            className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Browse jobs
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {applications.map((a) => {
            const job = jobById.get(a.job_id as string);
            const employer = job ? empById.get(job.employer_id as string) : null;
            const st = STATUS[a.status as string] ?? STATUS.applied;
            const canWithdraw = !["withdrawn", "not_selected", "selected"].includes(a.status as string);

            return (
              <li key={a.id as string} className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {job && !GONE.has(job.status as string) ? (
                      <Link href={`/jobs/${job.slug}`} className="font-medium hover:text-primary">
                        {job.title as string}
                      </Link>
                    ) : (
                      <span className="font-medium text-muted-foreground">
                        {job ? `${job.title as string} (role removed)` : "Role removed"}
                      </span>
                    )}
                    {job && ENDED_LABEL[job.status as string] && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {ENDED_LABEL[job.status as string]}
                      </span>
                    )}
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      {employer?.name ?? "Employer"}
                      {job?.city && ` · ${job.city}`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded px-2 py-0.5 text-xs font-medium",
                      st.tone === "good" && "bg-primary/10 text-primary",
                      st.tone === "bad" && "bg-muted text-muted-foreground",
                      st.tone === "neutral" && "bg-muted text-muted-foreground"
                    )}
                  >
                    {st.label}
                  </span>
                </div>

                <p className="mt-2 text-sm text-muted-foreground">{st.hint}</p>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span>Applied {new Date(a.created_at as string).toLocaleDateString()}</span>
                  {a.status_changed_at && a.status !== "applied" && (
                    <span>
                      Updated {new Date(a.status_changed_at as string).toLocaleDateString()}
                    </span>
                  )}
                  {canWithdraw && <WithdrawButton applicationId={a.id as string} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import Link from "next/link";
import { Send, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";
import { WithdrawButton } from "@/components/jobs/WithdrawButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Applications — UNN CNS" };

/**
 * What each status means to the applicant.
 *
 * Employers move applications through this pipeline; the wording here is
 * written for the nurse, not the recruiter — "Under review" rather than
 * "viewed", because the internal label is not what a candidate needs to read.
 */
const STATUS: Record<string, { label: string; hint: string; tone: "neutral" | "good" | "bad" }> = {
  submitted: { label: "Submitted", hint: "Waiting for the employer to review.", tone: "neutral" },
  viewed: { label: "Under review", hint: "The employer has opened your application.", tone: "neutral" },
  shortlisted: { label: "Shortlisted", hint: "They have your contact details and may be in touch.", tone: "good" },
  interview: { label: "Interview", hint: "You have been invited to interview.", tone: "good" },
  offered: { label: "Offer", hint: "An offer has been made.", tone: "good" },
  rejected: { label: "Not selected", hint: "The employer is not taking this forward.", tone: "bad" },
  withdrawn: { label: "Withdrawn", hint: "You withdrew this application.", tone: "bad" },
};

export default async function MyApplicationsPage() {
  const supabase = await createClient();

  // RLS scopes this to the caller's own applications.
  const { data: applications } = await supabase
    .from("cns_job_applications")
    .select("id,status,status_changed_at,created_at,cover_note,job_id")
    .order("created_at", { ascending: false });

  const jobIds = (applications ?? []).map((a) => a.job_id as string);
  const { data: jobs } = jobIds.length
    ? await supabase
        .from("cns_jobs")
        .select("id,slug,title,city,country,employer_id,status")
        .in("id", jobIds)
    : { data: [] };

  const employerIds = Array.from(new Set((jobs ?? []).map((j) => j.employer_id as string)));
  const { data: employers } = employerIds.length
    ? await supabase.from("cns_employers").select("id,name").in("id", employerIds)
    : { data: [] };

  const jobById = new Map((jobs ?? []).map((j) => [j.id as string, j]));
  const empById = new Map((employers ?? []).map((e) => [e.id as string, e]));

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <Send className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">My Applications</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
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
            const st = STATUS[a.status as string] ?? STATUS.submitted;
            const canWithdraw = !["withdrawn", "rejected", "offered"].includes(a.status as string);

            return (
              <li key={a.id as string} className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {job ? (
                      <Link href={`/jobs/${job.slug}`} className="font-medium hover:text-primary">
                        {job.title as string}
                      </Link>
                    ) : (
                      <span className="font-medium text-muted-foreground">Role removed</span>
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
                  {a.status_changed_at && a.status !== "submitted" && (
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

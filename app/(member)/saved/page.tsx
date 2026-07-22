import Link from "next/link";
import { Bookmark, MapPin, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { JOB_COLS, formatSalary, type CnsJob } from "@/lib/cns/jobs";
import { getJobLabels } from "@/lib/cns/taxonomy";
import { SaveJobButton } from "@/components/jobs/SaveJobButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved Jobs — UNN CNS" };

/** Blueprint §6.4: saved jobs must show active, closed and expired states. */
const CLOSED = new Set(["closed", "expired", "paused", "removed", "rejected"]);

export default async function SavedJobsPage() {
  const supabase = await createClient();

  const { data: saves } = await supabase
    .from("cns_job_saves")
    .select("job_id,created_at")
    .order("created_at", { ascending: false });

  const ids = (saves ?? []).map((s) => s.job_id as string);
  const [{ data: jobRows }, labels] = await Promise.all([
    ids.length
      ? supabase.from("cns_jobs").select(JOB_COLS).in("id", ids)
      : Promise.resolve({ data: [] as unknown[] }),
    getJobLabels(),
  ]);
  const jobs = (jobRows ?? []) as unknown as CnsJob[];

  const employerIds = Array.from(new Set(jobs.map((j) => j.employer_id)));
  const { data: employers } = employerIds.length
    ? await supabase.from("cns_employers").select("id,name").in("id", employerIds)
    : { data: [] };
  const empById = new Map((employers ?? []).map((e) => [e.id as string, e]));
  const byId = new Map(jobs.map((j) => [j.id, j]));

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <Bookmark className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">Saved Jobs</h1>
        </div>
        <p className="mt-2 text-muted-foreground">Roles you have kept to come back to.</p>
      </header>

      {!ids.length ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">Nothing saved yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the bookmark on any role to keep it here.
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
          {ids.map((id) => {
            const job = byId.get(id);
            // A saved job the viewer can no longer read (removed, or its
            // employer suspended) still deserves a row — silently dropping it
            // looks like the save was lost.
            if (!job) {
              return (
                <li key={id} className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
                  This role is no longer available.
                </li>
              );
            }
            const employer = empById.get(job.employer_id);
            const closed = CLOSED.has(job.status);
            return (
              <li key={id} className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/jobs/${job.slug}`} className="font-medium hover:text-primary">
                      {job.title}
                    </Link>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      {employer?.name ?? "Employer"}
                    </p>
                    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {job.city && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {[job.city, labels.country[job.country ?? ""] ?? job.country]
                            .filter(Boolean)
                            .join(", ")}
                        </div>
                      )}
                      <div>{labels.employment_type[job.employment_type] ?? job.employment_type}</div>
                      {formatSalary(job) && <div>{formatSalary(job)}</div>}
                    </dl>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {closed && (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                        {job.status}
                      </span>
                    )}
                    <SaveJobButton jobId={job.id} saved />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

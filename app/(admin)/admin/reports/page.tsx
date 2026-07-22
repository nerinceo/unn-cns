import Link from "next/link";
import { Flag, ExternalLink } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReportActions } from "@/components/jobs/ReportActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports — UNN CNS Admin" };

const REASON_LABEL: Record<string, string> = {
  suspicious_job: "Suspicious job",
  inaccurate_information: "Inaccurate information",
  discrimination: "Discrimination",
  payment_request: "Asked for payment",
  expired_job: "Expired job",
  duplicate_job: "Duplicate job",
  other: "Other",
};

/** Reports queue (blueprint §9.3). */
export default async function AdminReportsPage() {
  const admin = createAdminClient();

  const { data: reports } = await admin
    .from("cns_job_reports")
    .select("id,job_id,employer_id,reason,detail,status,resolution_note,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const jobIds = Array.from(new Set((reports ?? []).map((r) => r.job_id).filter(Boolean)));
  const { data: jobs } = jobIds.length
    ? await admin.from("cns_jobs").select("id,title,slug,status").in("id", jobIds as string[])
    : { data: [] };
  const jobById = new Map((jobs ?? []).map((j) => [j.id as string, j]));

  const open = (reports ?? []).filter((r) => r.status === "open" || r.status === "reviewing");
  const closed = (reports ?? []).filter((r) => r.status === "resolved" || r.status === "dismissed");

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <Flag className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">Reports</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Jobs and employers flagged by members. A payment request or a guaranteed-job claim should
          be acted on immediately — pause or remove the job from Job approvals.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Open ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            Nothing reported.
          </p>
        ) : (
          <ul className="space-y-3">
            {open.map((r) => {
              const job = r.job_id ? jobById.get(r.job_id as string) : null;
              return (
                <li key={r.id as string} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {REASON_LABEL[r.reason as string] ?? (r.reason as string)}
                      </p>
                      {job && (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {job.title as string}
                          <span className="ml-2 text-xs capitalize">({job.status as string})</span>
                        </p>
                      )}
                      {r.detail && (
                        <p className="mt-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                          {r.detail as string}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {new Date(r.created_at as string).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {job && (
                        <Link
                          href={`/jobs/${job.slug as string}`}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View job <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                      <ReportActions reportId={r.id as string} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Closed
          </h2>
          <ul className="space-y-2">
            {closed.map((r) => (
              <li
                key={r.id as string}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  {REASON_LABEL[r.reason as string] ?? (r.reason as string)}
                  {r.resolution_note && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {r.resolution_note as string}
                    </span>
                  )}
                </span>
                <span className="rounded bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                  {r.status as string}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

import Link from "next/link";
import { Briefcase, Users, Eye, FileEdit } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getEmployerJobs } from "@/lib/cns/jobs";
import { getJobLabels } from "@/lib/cns/taxonomy";
import { JobComposer } from "@/components/jobs/JobComposer";
import { JobStatusActions } from "@/components/jobs/JobStatusActions";
import { cn } from "@/lib/utils/cn";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  active: "bg-primary/10 text-primary",
  submitted: "bg-muted text-muted-foreground",
  changes_requested: "bg-secondary/10 text-secondary",
  paused: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  rejected: "bg-secondary/10 text-secondary",
  removed: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-muted text-muted-foreground",
  closed: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

export default async function EmployerJobsPage({
  params,
}: {
  params: Promise<{ employerId: string }>;
}) {
  const { employerId } = await params;
  const supabase = await createClient();

  const { data: employer } = await supabase
    .from("cns_employers")
    .select("status")
    .eq("id", employerId)
    .maybeSingle();
  const approved = employer?.status === "approved";

  // Employer members read ALL their own jobs — drafts included. Only the public
  // policy is limited to published rows.
  const [jobs, labels] = await Promise.all([getEmployerJobs(employerId), getJobLabels()]);
  const drafts = jobs.filter((j) => j.status === "draft" || j.status === "submitted" || j.status === "changes_requested");
  const live = jobs.filter((j) => j.status === "active" || j.status === "paused");
  const closed = jobs.filter((j) => j.status === "closed" || j.status === "expired" || j.status === "rejected" || j.status === "removed");

  const { data: apps } = await supabase
    .from("cns_job_applications")
    .select("job_id")
    .in("job_id", jobs.map((j) => j.id));
  const countByJob = new Map<string, number>();
  for (const a of apps ?? []) {
    countByJob.set(a.job_id as string, (countByJob.get(a.job_id as string) ?? 0) + 1);
  }

  function Group({ title, items, icon: Icon }: { title: string; items: typeof jobs; icon: typeof Briefcase }) {
    if (!items.length) return null;
    return (
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="h-4 w-4" /> {title} ({items.length})
        </h2>
        <ul className="space-y-2">
          {items.map((j) => (
            <li
              key={j.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{j.title}</p>
                <p className="text-xs text-muted-foreground">
                  {labels.employment_type[j.employment_type] ?? j.employment_type}
                  {j.city && ` · ${j.city}`}
                  {j.application_deadline && ` · closes ${j.application_deadline}`}
                  {!j.application_deadline && j.status === "draft" && " · no deadline set"}
                </p>
              </div>
              <Link
                href={`/employer/${employerId}/applications?job=${j.id}`}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                <Users className="h-3.5 w-3.5" />
                {countByJob.get(j.id) ?? 0}
              </Link>
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-xs font-medium capitalize",
                  STATUS_TONE[j.status] ?? "bg-muted text-muted-foreground"
                )}
              >
                {j.status.replace(/_/g, " ")}
              </span>
              <Link
                href={`/employer/${employerId}/jobs/${j.id}`}
                className="text-xs text-primary hover:underline"
              >
                Edit
              </Link>
              {j.status === "active" && (
                <Link href={`/jobs/${j.slug}`} className="text-xs text-muted-foreground hover:underline">
                  View live
                </Link>
              )}
              <JobStatusActions jobId={j.id} status={j.status} canPublish={approved} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Roles</h1>
        <p className="mt-1 text-muted-foreground">
          Drafts stay private until you publish. Only published roles appear on the public job
          board.
        </p>
      </header>

      {jobs.length === 0 && (
        <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          No roles yet. Create your first below.
        </p>
      )}

      <Group title="Drafts" items={drafts} icon={FileEdit} />
      <Group title="Live" items={live} icon={Eye} />
      <Group title="Closed" items={closed} icon={Briefcase} />

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Post a role
        </h2>
        <JobComposer employerId={employerId} canPublish={approved} />
      </section>
    </div>
  );
}

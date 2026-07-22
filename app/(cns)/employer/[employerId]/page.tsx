import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getEmployerJobs, EMPLOYMENT_TYPE_LABEL } from "@/lib/cns/jobs";
import { JobComposer } from "@/components/jobs/JobComposer";
import { cn } from "@/lib/utils/cn";

export const dynamic = "force-dynamic";

export default async function EmployerDashboard({
  params,
}: {
  params: Promise<{ employerId: string }>;
}) {
  const { employerId } = await params;
  const supabase = await createClient();

  // RLS restricts this row to approved members and staff, so a non-member
  // simply reads null.
  const { data: employer } = await supabase
    .from("cns_employers")
    .select("id,name,slug,status,verification_status")
    .eq("id", employerId)
    .maybeSingle();
  if (!employer) notFound();

  const jobs = await getEmployerJobs(employerId);
  const approved = employer.status === "approved";

  // Application counts per job, for the dashboard summary.
  const { data: apps } = await supabase
    .from("cns_job_applications")
    .select("job_id,status")
    .in("job_id", jobs.map((j) => j.id));
  const countByJob = new Map<string, number>();
  for (const a of apps ?? []) {
    countByJob.set(a.job_id as string, (countByJob.get(a.job_id as string) ?? 0) + 1);
  }

  return (
    <div className="space-y-8">
      <Link
        href="/employer"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Employers
      </Link>

      <header>
        <h1 className="text-2xl font-semibold">{employer.name}</h1>
        {!approved && (
          <p className="mt-2 flex items-center gap-1.5 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Awaiting UNN approval. You can draft roles now — publishing unlocks once approved.
          </p>
        )}
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Roles
        </h2>
        {jobs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            No roles yet. Create your first below.
          </p>
        ) : (
          <ul className="space-y-2">
            {jobs.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{j.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {EMPLOYMENT_TYPE_LABEL[j.employment_type]}
                    {j.city && ` · ${j.city}`}
                    {j.application_deadline && ` · closes ${j.application_deadline}`}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {countByJob.get(j.id) ?? 0}
                </span>
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium capitalize",
                    j.status === "published"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {j.status.replace(/_/g, " ")}
                </span>
                {j.status === "published" && (
                  <Link href={`/jobs/${j.slug}`} className="text-xs text-primary hover:underline">
                    View
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Post a role
        </h2>
        <JobComposer employerId={employerId} canPublish={approved} />
      </section>
    </div>
  );
}

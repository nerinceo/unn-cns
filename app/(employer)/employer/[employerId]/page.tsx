import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Clock, Briefcase, Inbox, Eye, FileEdit, ShieldCheck, Users, TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getEmployerJobs } from "@/lib/cns/jobs";

export const dynamic = "force-dynamic";

export default async function EmployerDashboard({
  params,
}: {
  params: Promise<{ employerId: string }>;
}) {
  const { employerId } = await params;
  const supabase = await createClient();

  const { data: employer } = await supabase
    .from("cns_employers")
    .select("id,name,status,verification_status,review_note")
    .eq("id", employerId)
    .maybeSingle();
  if (!employer) notFound();

  const jobs = await getEmployerJobs(employerId);
  const jobIds = jobs.length ? jobs.map((j) => j.id) : ["00000000-0000-0000-0000-000000000000"];

  const [{ data: apps }, { data: viewStats }] = await Promise.all([
    supabase.from("cns_job_applications").select("id,job_id,status,created_at").in("job_id", jobIds),
    supabase.rpc("cns_job_view_stats", { p_employer_id: employerId, p_days: 30 }),
  ]);

  const approved = employer.status === "approved";
  // Job status vocabulary: draft, submitted, changes_requested, active, paused,
  // closed, expired, rejected, removed. Application status: applied,
  // under_review, shortlisted, interview, selected, not_selected, withdrawn.
  const drafts = jobs.filter((j) => ["draft", "submitted", "changes_requested"].includes(j.status as string)).length;
  const live = jobs.filter((j) => j.status === "active").length;
  const total = apps?.length ?? 0;
  const needsReview = (apps ?? []).filter((a) => a.status === "applied").length;

  const viewsByJob = new Map(
    ((viewStats ?? []) as { job_id: string; views_total: number }[]).map((v) => [
      v.job_id,
      Number(v.views_total ?? 0),
    ])
  );
  const appsByJob = new Map<string, number>();
  for (const a of apps ?? []) {
    const k = a.job_id as string;
    appsByJob.set(k, (appsByJob.get(k) ?? 0) + 1);
  }

  const totalViews = Array.from(viewsByJob.values()).reduce((n, v) => n + v, 0);
  // Views are deduped per viewer per day, so this is closer to "how many people
  // who saw it applied" than a raw impression rate would be.
  const conversion = totalViews > 0 ? Math.round((total / totalViews) * 100) : null;

  // Live roles only: a closed job's conversion is history, and mixing it in
  // hides which of the CURRENT postings is not working.
  const livePerformance = jobs
    .filter((j) => j.status === "active")
    .map((j) => ({
      id: j.id,
      title: j.title,
      slug: j.slug,
      views: viewsByJob.get(j.id) ?? 0,
      applications: appsByJob.get(j.id) ?? 0,
    }))
    .sort((a, b) => b.views - a.views);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
          {employer.name as string}
          {employer.verification_status === "verified" && (
            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <ShieldCheck className="h-3 w-3" /> Verified
            </span>
          )}
        </h1>
      </header>

      {!approved && (
        <div className="rounded-lg border border-border bg-muted p-4 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <Clock className="h-4 w-4" />
            {employer.status === "rejected" ? "Not approved" : "Awaiting Nerusalem approval"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {employer.status === "rejected"
              ? ((employer.review_note as string) ?? "Contact Nerusalem if you believe this is a mistake.")
              : "You can draft roles now — publishing unlocks once your organisation is approved."}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat icon={FileEdit} label="Drafts" value={drafts} href={`/employer/${employerId}/jobs`} />
        <Stat icon={Briefcase} label="Live roles" value={live} href={`/employer/${employerId}/jobs`} />
        <Stat icon={Eye} label="Views" value={totalViews} href={`/employer/${employerId}/jobs`} />
        <Stat icon={Inbox} label="Applications" value={total} href={`/employer/${employerId}/applications`} />
        <Stat
          icon={Users}
          label="Needs review"
          value={needsReview}
          href={`/employer/${employerId}/applications`}
          highlight={needsReview > 0}
        />
      </div>

      {live > 0 && (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">How your live roles are performing</h2>
            {conversion !== null && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium tabular-nums text-foreground">{conversion}%</span> of
                people who viewed a role applied
              </p>
            )}
          </div>

          {totalViews === 0 ? (
            <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
              No views recorded yet. Numbers start accruing as soon as someone opens one of your
              roles — a view is counted once per person per day.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {livePerformance.map((j) => {
                const rate = j.views > 0 ? Math.round((j.applications / j.views) * 100) : null;
                // A role people find and do not apply to is a different problem
                // from one nobody finds, and the fix is different too — so say
                // which it is rather than just printing two numbers.
                const diagnosis =
                  j.views < 20
                    ? "Low visibility so far"
                    : rate !== null && rate < 3
                      ? "Seen, but few apply — check the pay and requirements"
                      : null;
                return (
                  <li key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                    <Link
                      href={`/jobs/${j.slug}`}
                      className="min-w-0 flex-1 truncate text-sm hover:text-primary"
                    >
                      {j.title}
                    </Link>
                    {diagnosis && (
                      <span className="text-xs text-muted-foreground">{diagnosis}</span>
                    )}
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {j.views} {j.views === 1 ? "view" : "views"}
                    </span>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {j.applications} {j.applications === 1 ? "application" : "applications"}
                    </span>
                    <span className="w-10 text-right text-xs font-medium tabular-nums">
                      {rate === null ? "—" : `${rate}%`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/employer/${employerId}/jobs`}
          className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
        >
          Post a role
        </Link>
        <Link
          href={`/employer/${employerId}/applications`}
          className="inline-flex h-10 items-center rounded-md border border-border px-5 text-sm font-medium"
        >
          Review applications
        </Link>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon, label, value, href, highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  href: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border bg-card p-4 transition-colors hover:border-primary ${
        highlight ? "border-primary" : "border-border"
      }`}
    >
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${highlight ? "text-primary" : ""}`}>
        {value}
      </p>
    </Link>
  );
}

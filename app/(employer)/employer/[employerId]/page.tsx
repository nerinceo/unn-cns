import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Briefcase, Inbox, Eye, FileEdit, ShieldCheck } from "lucide-react";
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
  const { data: apps } = await supabase
    .from("cns_job_applications")
    .select("id,status")
    .in("job_id", jobs.length ? jobs.map((j) => j.id) : ["00000000-0000-0000-0000-000000000000"]);

  const approved = employer.status === "approved";
  // Job status vocabulary: draft, submitted, changes_requested, active, paused,
  // closed, expired, rejected, removed. Application status: applied,
  // under_review, shortlisted, interview, selected, not_selected, withdrawn.
  const drafts = jobs.filter((j) => ["draft", "submitted", "changes_requested"].includes(j.status as string)).length;
  const live = jobs.filter((j) => j.status === "active").length;
  const total = apps?.length ?? 0;
  const needsReview = (apps ?? []).filter((a) => a.status === "applied").length;

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
            {employer.status === "rejected" ? "Not approved" : "Awaiting UNN approval"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {employer.status === "rejected"
              ? ((employer.review_note as string) ?? "Contact UNN if you believe this is a mistake.")
              : "You can draft roles now — publishing unlocks once your organisation is approved."}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={FileEdit} label="Drafts" value={drafts} href={`/employer/${employerId}/jobs`} />
        <Stat icon={Eye} label="Live roles" value={live} href={`/employer/${employerId}/jobs`} />
        <Stat icon={Inbox} label="Applications" value={total} href={`/employer/${employerId}/applications`} />
        <Stat
          icon={Briefcase}
          label="Needs review"
          value={needsReview}
          href={`/employer/${employerId}/applications`}
          highlight={needsReview > 0}
        />
      </div>

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

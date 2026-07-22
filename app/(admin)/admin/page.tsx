import Link from "next/link";
import { Building2, Clock, Briefcase, Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — UNN CNS" };

export default async function AdminOverview() {
  // Service role: these are platform-wide counts across every organisation,
  // which no user-scoped policy would return. The layout has already confirmed
  // the caller is staff.
  const admin = createAdminClient();
  const head = { count: "exact" as const, head: true };

  const [pendingEmployers, employers, liveJobs, applications] = await Promise.all([
    admin.from("cns_employers").select("id", head).eq("status", "pending"),
    admin.from("cns_employers").select("id", head),
    admin.from("cns_jobs").select("id", head).eq("status", "published"),
    admin.from("cns_job_applications").select("id", head),
  ]).then((rs) => rs.map((r) => r.count ?? 0));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Platform overview</h1>
        <p className="mt-1 text-muted-foreground">
          Administration for CNS. Members and employers never see this area.
        </p>
      </header>

      {pendingEmployers > 0 && (
        <Link
          href="/admin/employers"
          className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 p-4 transition-colors hover:bg-primary/10"
        >
          <Clock className="h-5 w-5 shrink-0 text-primary" />
          <span className="text-sm">
            <strong>
              {pendingEmployers} organisation{pendingEmployers === 1 ? "" : "s"}
            </strong>{" "}
            awaiting review — nothing they post is public until approved.
          </span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Clock} label="Pending employers" value={pendingEmployers} href="/admin/employers" />
        <Stat icon={Building2} label="Organisations" value={employers} href="/admin/employers" />
        <Stat icon={Briefcase} label="Live roles" value={liveJobs} href="/jobs" />
        <Stat icon={Users} label="Applications" value={applications} href="/admin/employers" />
      </div>
    </div>
  );
}

function Stat({
  icon: Icon, label, value, href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href} className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </Link>
  );
}

import { Users, ShieldCheck, ExternalLink } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { hubLink } from "@/lib/hub";

export const dynamic = "force-dynamic";
export const metadata = { title: "Members — Central Nursing Systems Admin" };

/**
 * Member activity in CNS.
 *
 * Deliberately read-only. Accounts, roles and nurse verification are HUB's
 * responsibility — duplicating that here would mean two places to change a
 * role and eventually two answers to the same question. This shows CNS-side
 * engagement and links out for anything account-related.
 */
export default async function AdminMembersPage() {
  const admin = createAdminClient();
  const head = { count: "exact" as const, head: true };

  const [members, verified, attempts, resumes, applications] = await Promise.all([
    admin.from("users").select("id", head),
    admin.from("users").select("id", head).eq("verification_status", "verified"),
    admin.from("cns_attempts").select("id", head).eq("status", "submitted"),
    admin.from("cns_resumes").select("id", head),
    admin.from("cns_job_applications").select("id", head),
  ]).then((rs) => rs.map((r) => r.count ?? 0));

  const stats = [
    { label: "UNN members", value: members },
    { label: "Verified nurses", value: verified },
    { label: "Attempts submitted", value: attempts },
    { label: "Resumes created", value: resumes },
    { label: "Job applications", value: applications },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <Users className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">Members</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          How members are using CNS.
        </p>
      </header>

      <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-lg border border-border bg-muted p-5">
        <p className="flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4 text-primary" /> Accounts are managed in UNN Hub
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Roles, suspensions and nurse verification all live in Hub. CNS reads that identity and
          never writes it, so there is exactly one place a member&apos;s status can be changed.
        </p>
        <a
          href={hubLink("/admin-portal/users")}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          Open Hub admin <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

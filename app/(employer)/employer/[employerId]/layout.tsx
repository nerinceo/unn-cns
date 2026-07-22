import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { employerNav } from "@/components/shell/nav";
import { getMyEmployers } from "@/lib/cns/jobs";
import { isStaff } from "@/lib/cns/admin";

/**
 * Employer portal — scoped to one organisation.
 *
 * The guard lives here rather than in the group layout because /employer itself
 * must stay reachable by any member (that is where you register). Everything
 * under an organisation id requires membership of THAT organisation.
 *
 * 404 rather than a redirect: someone probing employer ids should not be able
 * to tell an existing organisation from a non-existent one.
 */
export default async function EmployerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ employerId: string }>;
}) {
  const { employerId } = await params;
  const supabase = await createClient();

  // RLS already restricts this row to members, creators and staff, so a
  // non-member simply reads null.
  const { data: employer } = await supabase
    .from("cns_employers")
    .select("id,name")
    .eq("id", employerId)
    .maybeSingle();
  if (!employer) notFound();

  const [employers, staff] = await Promise.all([getMyEmployers(), isStaff()]);

  return (
    <AppShell
      portal="employer"
      nav={employerNav(employerId)}
      wordmark={(employer.name as string).slice(0, 28)}
      employers={employers.map((m) => ({ id: m.employer.id, name: m.employer.name }))}
      isStaff={staff}
    >
      {children}
    </AppShell>
  );
}

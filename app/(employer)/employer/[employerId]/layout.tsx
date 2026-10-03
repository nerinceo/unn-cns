import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
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

  // MEMBERSHIP IS CHECKED HERE, not inferred from RLS. This used to treat
  // "the row is readable" as "you belong to it" — but an APPROVED employer is
  // publicly readable (that is how job adverts show who is hiring), so any
  // signed-in member could open any approved organisation's portal: dashboard,
  // jobs, settings (E-B-GRD). Only an approved membership of THIS
  // organisation — or platform staff — gets in; a pending one does not.
  const [employers, staff] = await Promise.all([getMyEmployers(), isStaff()]);
  const mine = employers.find((m) => m.employer.id === employerId);
  if (!mine && !staff) notFound();

  const { data: employer } = await supabase
    .from("cns_employers")
    .select("id,name")
    .eq("id", employerId)
    .maybeSingle();
  if (!employer) notFound();

  return (
    <AppShell
      portal="employer"
      employerId={employerId}
      wordmark={(employer.name as string).slice(0, 28)}
      employers={employers.map((m) => ({ id: m.employer.id, name: m.employer.name }))}
      isStaff={staff}
    >
      {children}
    </AppShell>
  );
}

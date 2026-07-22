import { AppShell } from "@/components/shell/AppShell";
import { getMyEmployers } from "@/lib/cns/jobs";
import { isStaff } from "@/lib/cns/admin";

/**
 * Member portal — the default CNS experience for nurses and students.
 *
 * Employer and admin tools are deliberately NOT in this nav. They live in
 * their own route groups and are reachable only through the portal switcher,
 * and only by someone who actually holds that role.
 */
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const [employers, staff] = await Promise.all([getMyEmployers(), isStaff()]);

  return (
    <AppShell
      portal="member"
      wordmark="CNS"
      employers={employers.map((m) => ({ id: m.employer.id, name: m.employer.name }))}
      isStaff={staff}
    >
      {children}
    </AppShell>
  );
}

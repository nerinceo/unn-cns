import { AppShell } from "@/components/shell/AppShell";
import { getMyEmployers } from "@/lib/cns/jobs";
import { isStaff } from "@/lib/cns/admin";

/**
 * /employer landing — the registration page.
 *
 * Intentionally NOT gated on being an employer: this is where a member goes to
 * become one. It wears the member chrome, because at this point that is what
 * they are. Once inside an organisation, [employerId]/layout takes over with
 * the employer nav.
 */
export default async function EmployerLandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

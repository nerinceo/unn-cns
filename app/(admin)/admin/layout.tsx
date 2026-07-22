import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { ADMIN_NAV } from "@/components/shell/nav";
import { isStaff } from "@/lib/cns/admin";
import { getMyEmployers } from "@/lib/cns/jobs";

/**
 * Admin portal — platform staff only.
 *
 * Guarded once here rather than in every page, so a new admin screen is
 * protected by existing. 404 rather than redirect: a non-staff member should
 * not learn that this area exists.
 *
 * This is presentation-level only. Every staff-only write is independently
 * enforced by RLS or a SECURITY DEFINER function that re-checks cns_is_staff().
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isStaff())) notFound();

  const employers = await getMyEmployers();

  return (
    <AppShell
      portal="admin"
      nav={ADMIN_NAV}
      wordmark="Admin"
      employers={employers.map((m) => ({ id: m.employer.id, name: m.employer.name }))}
      isStaff
    >
      {children}
    </AppShell>
  );
}

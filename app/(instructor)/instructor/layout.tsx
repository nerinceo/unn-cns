import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getMyEmployers } from "@/lib/cns/jobs";
import { isStaff } from "@/lib/cns/admin";
import { getMyInstructor } from "@/lib/cns/lms";

/**
 * Instructor portal — authoring only.
 *
 * NO SIGN-UP HAPPENS HERE, and there is no application form. CNS has no auth UI
 * at all; an instructor applies and is approved in HUB, and the shared
 * `.nerusalem.com` session then carries them straight into this dashboard with
 * no second account. That is the whole "no account needed" requirement: the
 * approval lives with the platform admins, the authoring lives with the
 * educator, and neither needs a separate login.
 *
 * 404 rather than a redirect for a non-instructor: someone probing this path
 * should not learn that the portal exists.
 */
export default async function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const instructor = await getMyInstructor();

  // `approved` is the gate. draft/pending/rejected/suspended all land on 404 —
  // there is nothing to author until HUB staff have approved the application.
  if (!instructor || instructor.status !== "approved") notFound();

  const [employers, staff] = await Promise.all([getMyEmployers(), isStaff()]);

  return (
    <AppShell
      portal="instructor"
      wordmark={instructor.display_name.slice(0, 28)}
      employers={employers.map((m) => ({ id: m.employer.id, name: m.employer.name }))}
      isStaff={staff}
      isInstructor
    >
      {children}
    </AppShell>
  );
}

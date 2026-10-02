import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getCurrentUser, getCurrentUserProfile } from "@/lib/supabase/server";
import { END_SESSION_URL, authUserIsGone } from "@/lib/auth/session-guard";
import { toAccountScope } from "@/lib/access";
import { getMyEmployers } from "@/lib/cns/jobs";
import { isStaff } from "@/lib/cns/admin";

/**
 * Member portal — the default CNS experience for nurses and students.
 *
 * Employer and admin tools are deliberately NOT in this nav. They live in
 * their own route groups and are reachable only through the portal switcher,
 * and only by someone who actually holds that role.
 *
 * A 'uhn'-scoped professional reaches two pages in this group — /saved and
 * /applications — and gets the job-board nav instead of the nursing one. The
 * scope is read from the users row rather than the JWT claim because the claim
 * only refreshes when the token does, so an account moved between apps can
 * carry a stale one for up to an hour; middleware may use the claim (it must be
 * cheap on every navigation) but a layout deciding what to RENDER should not.
 */
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentUserProfile();

  // A suspended or deleted account is shown the door rather than left
  // browsing. Middleware sees only the JWT, which outlives a suspension (until
  // it expires) and a deletion, and an account suspended before suspension
  // applied a ban carries only this column. The row is already loaded, so the
  // suspended check is free; the deletion check is a network call made only
  // when the row has come back empty. HUB's end-session route re-verifies
  // before signing anyone out, so a transient empty read cannot end a session.
  if ((profile as { account_status?: string | null } | null)?.account_status === "suspended") {
    redirect(END_SESSION_URL);
  }
  if (!profile) {
    const user = await getCurrentUser();
    if (user && (await authUserIsGone(user.id))) redirect(END_SESSION_URL);
  }
  const professional = toAccountScope(profile?.account_scope) === "uhn";

  // Both lookups feed the portal switcher, which a professional never sees.
  // Promise.all takes plain values alongside promises, so skipping them costs a
  // professional two round trips without making the nurse path serial.
  const [employers, staff] = await Promise.all([
    professional ? [] : getMyEmployers(),
    professional ? false : isStaff(),
  ]);

  return (
    <AppShell
      portal="member"
      wordmark="Central Nerusalem Space"
      employers={employers.map((m) => ({ id: m.employer.id, name: m.employer.name }))}
      isStaff={staff}
      professional={professional}
    >
      {children}
    </AppShell>
  );
}

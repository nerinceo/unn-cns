import { AppShell } from "@/components/shell/AppShell";
import { getCurrentUserProfile } from "@/lib/supabase/server";
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
      wordmark="Central Nursing Systems"
      employers={employers.map((m) => ({ id: m.employer.id, name: m.employer.name }))}
      isStaff={staff}
      professional={professional}
    >
      {children}
    </AppShell>
  );
}

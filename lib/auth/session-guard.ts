import { createAdminClient } from "@/lib/supabase/admin";
import { hubLink } from "@/lib/hub";

/**
 * Where a session that must end is sent: HUB's /auth/end-session, which
 * re-checks the account with the service role, revokes the session, expires
 * the shared `.nerusalem.com` auth cookies and lands on HUB's /welcome (with
 * the suspension notice when that is the reason). CNS has no auth UI of its
 * own, so ending a session is HUB's job here exactly as signing in is.
 *
 * The route re-verifies rather than trusting the caller, so sending a session
 * there can never sign a healthy account out.
 *
 * Same contract as HUB lib/auth/session-guard.ts (not a drift-checked file).
 */
export const END_SESSION_URL = hubLink("/auth/end-session");

/**
 * True only when the auth server says this user no longer exists.
 *
 * A JWT stays valid until it expires (up to an hour) even after its user is
 * deleted, so getClaims() alone cannot see a deletion. This is a network call,
 * which is why callers only make it when the users row has already come back
 * empty — never per navigation. Any other failure answers false: a network
 * blip must not sign anyone out.
 */
export async function authUserIsGone(userId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
    if (error) return error.status === 404;
    return !data?.user;
  } catch {
    return false;
  }
}

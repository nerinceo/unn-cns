import type { SupabaseClient } from "@supabase/supabase-js";
import { actionError, logError, userMessage } from "@/lib/errors";

/**
 * Suspending an account, in one place.
 *
 * Before this, "suspend" wrote `users.account_status = 'suspended'` and nothing
 * else — and nothing in the auth path ever read that column. Verified in
 * production: a suspended account signed in normally and browsed the feed. Only
 * a handful of individual actions (messaging, payments) checked it, so the
 * punishment amounted to losing the ability to send a message.
 *
 * Three things now happen together, because any one alone leaves a hole:
 *
 *   1. `account_status` — unchanged, still the column the admin UI and the
 *      action-level checks read.
 *   2. `ban_duration` — Supabase's own switch. This is what actually stops
 *      them: GoTrue refuses both a fresh sign-in and a refresh-token exchange
 *      for a banned user, in every app, without any of them needing code.
 *   3. `app_metadata.suspended` — a JWT claim, so middleware can refuse a
 *      suspended session without a database round-trip on every navigation.
 *
 * RESIDUAL WINDOW, deliberately accepted: an access token already in a browser
 * stays cryptographically valid until it expires (up to an hour). Nothing short
 * of a per-request lookup can revoke a stateless token, and putting a database
 * read on every navigation is the exact cost this codebase avoids elsewhere.
 * So a suspension takes effect immediately for anything that needs a fresh
 * token, and within the hour for a tab that is already open.
 */

/** 100 years. GoTrue takes a duration string, not a date. */
const FOREVER = "876000h";

export async function applySuspension(
  admin: SupabaseClient,
  userId: string,
  suspended: boolean
): Promise<{ error?: string }> {
  const { error: dbError } = await admin
    .from("users")
    .update({ account_status: suspended ? "suspended" : "active" })
    .eq("id", userId);
  if (dbError) return actionError("suspension:applySuspension", dbError, undefined, { userId });

  // Order matters on the way in: ban first, so there is no instant where the
  // row says suspended but the credentials still work.
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: suspended ? FOREVER : "none",
    app_metadata: { suspended: suspended ? true : null },
  });

  if (authError) {
    // The row now disagrees with auth. Say so rather than reporting success —
    // a half-applied suspension is the case an admin most needs to know about.
    logError("suspension:applySuspension:auth", authError, { userId });
    return {
      error: `Account row updated but the sign-in block failed: ${userMessage(authError)}`,
    };
  }

  return {};
}

/**
 * Read suspension from a verified JWT's claims.
 *
 * Same contract as scopeFromClaims in lib/access.ts: it lives in app_metadata,
 * which only the service role can write, so a user cannot clear their own.
 * A missing claim means not suspended — correct, since every token minted
 * before this existed belongs to an account nobody had suspended this way.
 */
export function isSuspendedFromClaims(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  const appMeta = (claims as { app_metadata?: unknown }).app_metadata;
  if (!appMeta || typeof appMeta !== "object") return false;
  return (appMeta as { suspended?: unknown }).suspended === true;
}

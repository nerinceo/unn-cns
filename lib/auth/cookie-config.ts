/**
 * The single shared auth-cookie contract between app.unnhub.org (HUB) and
 * cns.unnhub.org (CNS).
 *
 * Why this file exists: Supabase auth cookies were previously written with no
 * `domain`, which makes browsers scope them host-only — so they never reach a
 * sibling subdomain. Writing them with `domain=.unnhub.org` is what gives the
 * two apps one session. That value has to be identical in EVERY place that
 * writes an auth cookie (six of them, see below) or refresh-token rotation
 * desyncs and Supabase's reuse detection revokes the whole token family.
 *
 * Note the shared contract between the two apps is the ENV VAR, not this
 * module. CNS keeps its own copy of this file; both read the same
 * NEXT_PUBLIC_COOKIE_DOMAIN from deployment config, so the copies cannot drift
 * on the one value that would actually break a session.
 *
 * Cookie writers that must use withAuthCookieOptions():
 *   1. lib/supabase/client.ts        (browser)
 *   2. lib/supabase/server.ts        (server components / actions)
 *   3. middleware.ts                 (rotation on every navigation)
 *   4. app/auth/callback/route.ts    (OAuth code exchange)
 *   5. app/auth/confirm/route.ts     (email OTP / recovery links)
 *   6. app/(auth)/login/page.tsx     (writes unn_remember_me by hand)
 */

/**
 * Unset on localhost and previews => host-only cookies => the exact behaviour
 * this app had before CNS existed. ".unnhub.org" in production.
 *
 * Browsers reject a `domain` attribute for bare "localhost", which is why this
 * must stay empty locally. To exercise real cross-subdomain SSO on a dev
 * machine, use app.localtest.me / cns.localtest.me (both resolve to 127.0.0.1)
 * with NEXT_PUBLIC_COOKIE_DOMAIN=.localtest.me. Testing on localhost:3000 vs
 * localhost:3001 gives a FALSE PASS — ports are not part of cookie identity,
 * so those two origins share cookies whether or not this is set.
 */
export const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;

/**
 * 30 days. Was duplicated as a bare `60 * 60 * 24 * 30` in four files, each
 * carrying a comment warning it had to stay in sync. This is now the only copy.
 *
 * The browser only persists a cookie past tab close when it has a max-age;
 * without one supabase-js writes session cookies that vanish on browser quit.
 */
export const REMEMBER_ME_MAX_AGE_S = 60 * 60 * 24 * 30;

/**
 * Bumped whenever COOKIE_DOMAIN changes. Middleware compares this against the
 * `unn_cookie_domain_v` marker cookie to detect sessions still holding cookies
 * written under the previous domain, and purges them. See middleware.ts.
 */
export const COOKIE_DOMAIN_VERSION = "2";

/** Name of the marker cookie that records which domain version a browser has. */
export const COOKIE_DOMAIN_MARKER = "unn_cookie_domain_v";

/** Set by the user's "Stay signed in" choice on the login page. */
export const REMEMBER_ME_COOKIE = "unn_remember_me";

/**
 * How middleware migrates a browser still holding cookies from the previous
 * domain version.
 *
 * "silent"  — (default) swap the cookies atomically; the user never notices.
 * "relogin" — clear the session and send them to /welcome. Costs everyone one
 *             re-login but is completely deterministic. Escape hatch if the
 *             silent path misbehaves in production; flip the env var, no deploy.
 */
export const COOKIE_MIGRATION_MODE =
  process.env.COOKIE_MIGRATION_MODE === "relogin" ? "relogin" : "silent";

/**
 * Merge the cross-subdomain domain (and the Remember Me max-age) into whatever
 * cookie options supabase-ssr hands us.
 *
 * Conditional spreads rather than `domain: COOKIE_DOMAIN` on purpose: an
 * explicit `undefined` passed through Next's cookieStore.set and through
 * cookie.serialize is handled inconsistently, whereas omitting the key is
 * unambiguous.
 */
export function withAuthCookieOptions<T extends object>(
  options: T,
  remember: boolean
): T & { domain?: string; maxAge?: number } {
  return {
    ...options,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
    ...(remember ? { maxAge: REMEMBER_ME_MAX_AGE_S } : {}),
  };
}

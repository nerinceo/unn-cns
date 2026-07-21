import { createBrowserClient } from "@supabase/ssr";
import {
  COOKIE_DOMAIN,
  REMEMBER_ME_COOKIE,
  withAuthCookieOptions,
} from "@/lib/auth/cookie-config";

function readRememberMeCookie(): boolean {
  if (typeof document === "undefined") return false;
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${REMEMBER_ME_COOKIE}=([^;]*)`)
  );
  return m?.[1] === "1";
}

/**
 * Safety net for the cookie-domain migration. TEMPORARY — delete alongside the
 * middleware purge.
 *
 * Middleware handles the swap on any navigation, but a tab left open across the
 * deploy can rotate client-side and end up holding BOTH a host-only and a
 * dotted cookie of the same name. The browser then sends both, and
 * @supabase/ssr's parser keeps the FIRST — which browsers order as the older
 * host-only one. That means reading a stale token, rotating from it, and
 * tripping Supabase's refresh-token reuse detection, which revokes the whole
 * family and signs the user out of both apps.
 *
 * document.cookie exposes no domain attribute, so we cannot tell the two apart
 * by inspection — but a name appearing twice is itself proof of the split, and
 * writing a deletion with no domain targets precisely the host-only copy.
 * Auth cookies are not httpOnly, so this is possible from JS.
 *
 * Guarded on a name appearing MORE THAN ONCE, which is what makes it safe: a
 * user with a single cookie is never touched.
 */
function dedupeHostOnlyAuthCookies() {
  if (typeof document === "undefined" || !COOKIE_DOMAIN) return;

  const counts: Record<string, number> = {};
  document.cookie.split("; ").forEach((part) => {
    const name = part.split("=")[0];
    if (!name || !name.startsWith("sb-")) return;
    counts[name] = (counts[name] ?? 0) + 1;
  });

  Object.keys(counts).forEach((name) => {
    if (counts[name] > 1) {
      document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
    }
  });
}

export function createClient() {
  // Repair a split-brain cookie state before the client can read a stale token.
  dedupeHostOnlyAuthCookies();

  // cookieOptions is now always passed (it used to be `undefined` when the user
  // hadn't ticked "Stay signed in") because the cookie DOMAIN has to be applied
  // either way — that's what lets cns.unnhub.org see this session.
  //
  // Caveat worth knowing: @supabase/ssr overrides cookieOptions.maxAge with its
  // own 400-day default, so the Remember Me max-age passed here is currently
  // inert on the browser path — auth cookies are 400-day persistent regardless.
  // That is a pre-existing upstream quirk, deliberately NOT fixed as part of the
  // cross-subdomain work. It is passed anyway so all six writers stay textually
  // identical and a future @supabase/ssr fix picks it up for free. `domain` IS
  // honoured, on both the set and the remove paths, which is what makes
  // client-side signOut() correctly delete the shared cookie.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: withAuthCookieOptions({}, readRememberMeCookie()) },
  );
}

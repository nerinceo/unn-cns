/**
 * Which app in the UNN family an account belongs to.
 *
 * HUB, CNS and UHN (uhn.nerusalem.com) all sit on ONE Supabase project, so
 * they share auth.users and public.users. A UHN account's email and password
 * therefore work at unn.nerusalem.com too — putting those users on a separate
 * domain decides where they LIVE, not whether this app lets them in.
 *
 * `users.account_scope` is what closes that. See
 * supabase/migrations/0001_uhn_accounts.sql, which also adds the column to
 * guard_user_self_privilege() so a user cannot promote themselves out of it.
 *
 *   'full' — nurses. This app and CNS. The DEFAULT, so every account that
 *            existed before UHN is unaffected and nothing needed backfilling.
 *   'uhn'  — non-nurse healthcare professionals. UHN only.
 *
 * Dependency-free: middleware imports it on the edge runtime.
 */

export type AccountScope = "full" | "uhn";

/** Where a UHN account belongs. Not env-driven — it is a fixed sibling host. */
export const UHN_URL = process.env.NEXT_PUBLIC_UHN_URL ?? "https://uhn.nerusalem.com";

/**
 * Read the scope from a verified JWT's claims.
 *
 * Carried in `app_metadata`, which Supabase includes as a token claim and which
 * only the SERVICE ROLE can write — unlike `user_metadata`, which the user can
 * set themselves and would therefore be self-serve escalation. Middleware can
 * read it with no database round-trip, preserving the local JWKS verification
 * that getClaims() exists to provide.
 *
 * A missing claim means 'full'. That is correct rather than merely lenient:
 * every session minted before UHN existed belongs to a nurse.
 */
export function scopeFromClaims(claims: unknown): AccountScope {
  if (!claims || typeof claims !== "object") return "full";
  const appMeta = (claims as { app_metadata?: unknown }).app_metadata;
  if (!appMeta || typeof appMeta !== "object") return "full";
  return (appMeta as { scope?: unknown }).scope === "uhn" ? "uhn" : "full";
}

/** Normalise an arbitrary database value to a scope. Unknown values fail safe. */
export function toAccountScope(value: unknown): AccountScope {
  return value === "uhn" ? "uhn" : "full";
}

// ─── Where a person lands after signing in ───────────────────────────────────
/**
 * ONE function decides which app opens after login, for every account type.
 *
 * The rule: if you SELL something on UNN, we open the page where you do that
 * work. A nurse who teaches lands on her courses; a nurse who sells lands on
 * her shop; a plain nurse lands on the feed. Everyone can switch from the menu.
 *
 * It must be called from BOTH the login handler and middleware. Login-only
 * routing looks right the first time and then breaks for everyone with an
 * existing session or a bookmark, which is most people most of the time.
 *
 * Dependency-free and synchronous on purpose: middleware runs it on the edge
 * runtime, so it takes plain facts the caller has already fetched rather than
 * doing its own database work.
 *
 * MIRRORED FILE — this module exists in unn-platform, unn-cns and unn-uhn and
 * must stay identical. Drift here does not throw; it silently lands people in
 * the wrong app. See docs/SHARED-WITH-HUB.md.
 */
export type HomeKey = "feed" | "instructor" | "vendor" | "uhn" | "org";

const HOME_KEYS = new Set<HomeKey>(["feed", "instructor", "vendor", "uhn", "org"]);

/** Narrow a stored `users.preferred_home` value. Unknown values are ignored. */
export function toHomeKey(value: unknown): HomeKey | null {
  return typeof value === "string" && HOME_KEYS.has(value as HomeKey)
    ? (value as HomeKey)
    : null;
}

export type HomeFacts = {
  scope: AccountScope;
  /** Owner/admin of a UHN organisation. */
  isOrgAdmin?: boolean;
  /** An APPROVED instructor — a pending application is not a workplace yet. */
  isInstructor?: boolean;
  /** An APPROVED vendor, likewise. */
  isVendor?: boolean;
  /** users.preferred_home, if they've ever used the portal switcher. */
  preferred?: unknown;
};

/**
 * The chosen home as a stable key. Resolve it to a URL with homeUrl().
 *
 * A stored preference wins over the computed default — but only if the person
 * still qualifies for it. Someone whose vendor account was suspended must not
 * keep being sent to a shop they can no longer use.
 */
export function resolveHomeKey(facts: HomeFacts): HomeKey {
  const eligible = (key: HomeKey): boolean => {
    if (key === "uhn") return facts.scope === "uhn";
    if (key === "org") return facts.scope === "uhn" && !!facts.isOrgAdmin;
    if (key === "instructor") return !!facts.isInstructor;
    if (key === "vendor") return !!facts.isVendor;
    return facts.scope !== "uhn"; // "feed"
  };

  const preferred = toHomeKey(facts.preferred);
  if (preferred && eligible(preferred)) return preferred;

  // Computed default, most-specialised first.
  if (facts.scope === "uhn") return facts.isOrgAdmin ? "org" : "uhn";
  if (facts.isInstructor) return "instructor";
  if (facts.isVendor) return "vendor";
  return "feed";
}

/**
 * Absolute URL for a home key.
 *
 * Absolute rather than a path because three of the five live in sibling apps,
 * and the caller (login, middleware) is often not the app that owns the
 * destination. The shared `.nerusalem.com` session means the hop is seamless.
 */
export function homeUrl(key: HomeKey): string {
  const cns = (process.env.NEXT_PUBLIC_CNS_URL ?? "https://cns.nerusalem.com").replace(/\/+$/, "");
  const uhn = UHN_URL.replace(/\/+$/, "");
  switch (key) {
    case "uhn":
      return uhn;
    case "org":
      return `${uhn}/org`;
    case "instructor":
      return `${cns}/instructor`;
    case "vendor":
      return "/marketplace/market/dashboard";
    default:
      return "/home";
  }
}

/** Convenience: facts in, URL out. */
export function resolveHome(facts: HomeFacts): string {
  return homeUrl(resolveHomeKey(facts));
}

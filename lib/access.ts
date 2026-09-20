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
 *   'full'   — nurses. This app and CNS. The DEFAULT, so every account that
 *              existed before UHN is unaffected and nothing needed backfilling.
 *   'uhn'    — non-nurse healthcare professionals.
 *   'vendor' — marketplace sellers. See migration 0035.
 *
 * WHAT 'uhn' MEANS CHANGED. It used to mean "UHN only", enforced by a hard
 * redirect at the top of HUB's and CNS's middleware. The professional now lives
 * HERE, in a restricted shell, and reaches CNS for the job board:
 *
 *   HUB  /pro/*       their whole experience — registry, units, applications
 *   CNS  the job board and saved jobs, and nothing else
 *   UHN  only if they administer an organisation
 *
 * 'vendor' IS THE TIGHTEST OF THE THREE. A marketplace seller is a business,
 * not a member of the nursing community, so they get ONE app and no sibling:
 *
 *   HUB  /seller/*    their whole experience — listings, orders, payouts
 *   CNS  NOTHING. isCnsVendorPath() is deliberately always false.
 *   UHN  NOTHING.
 *
 * That last part is the reason this file is mirrored rather than local. All
 * three apps share one Supabase project and one `.nerusalem.com` session
 * cookie, so a vendor who signs in at HUB is ALREADY signed in at CNS — where
 * the LMS, the instructor tools and the ~9k-post library sit behind nothing
 * but a session. Adding the scope in HUB alone does not isolate a vendor; it
 * only moves where they land. The isolation exists once, and only once, all
 * three middlewares refuse them.
 *
 * The two allowlists below are what replaced those redirects. They live in this
 * file, rather than in each app's middleware, for one reason: this module is
 * mirrored into all three repos and covered by the drift check, so the rule
 * cannot be tightened in one app and forgotten in another. A professional who
 * can reach a page in HUB that CNS's copy would have refused is not a cosmetic
 * inconsistency — it is a hole.
 *
 * Dependency-free: middleware imports it on the edge runtime.
 */

export type AccountScope = "full" | "uhn" | "vendor";

/** Where a UHN account belongs. Not env-driven — it is a fixed sibling host. */
export const UHN_URL = process.env.NEXT_PUBLIC_UHN_URL ?? "https://uhn.nerusalem.com";

/**
 * The professional's root in HUB. Everything they can reach here hangs off it.
 *
 * A single prefix rather than a set of scattered routes is deliberate: the gate
 * is then one string comparison that cannot drift out of step with the pages,
 * and deleting the folder is a complete revert. It also keeps professionals off
 * HUB's own /units and /settings, which belong to nurses and must not gain a
 * scope conditional.
 */
export const PRO_ROOT = "/pro";

/**
 * May a 'uhn' account reach this path in HUB?
 *
 * Deny-by-default: anything not under /pro is refused, including /api. The
 * professional pages drive every write through server actions (which POST to
 * their own route, not to /api), so nothing under /pro needs an API route — and
 * letting /api through "just in case" would leave HUB's marketplace, Stripe and
 * messaging endpoints reachable by a population that has no business there.
 *
 * Auth and public paths are NOT handled here. The caller checks those first,
 * because they apply to signed-out visitors too and this function only has an
 * opinion about accounts that already have a scope.
 */
export function isProfessionalPath(pathname: string): boolean {
  return pathname === PRO_ROOT || pathname.startsWith(`${PRO_ROOT}/`);
}

/**
 * The vendor's root in HUB. Everything a marketplace seller can reach hangs
 * off it, for the same single-prefix reason PRO_ROOT is one string.
 *
 * NOT "/marketplace/market/dashboard", which is where the seller dashboard
 * used to live. That path sits under /marketplace — the nurse-facing shop — so
 * a prefix gate built on it would either have to admit the entire storefront
 * or special-case a sub-path of it. /seller is a sibling of /marketplace, not a
 * child, precisely so the gate stays one comparison.
 */
export const VENDOR_ROOT = "/seller";

/**
 * May a 'vendor' account reach this path in HUB?
 *
 * Deny-by-default, exactly like isProfessionalPath. Everything outside /seller
 * is refused — the feed, the nurse marketplace, messaging, units, settings and
 * /api alike.
 *
 * /api IS REFUSED, and that matters more here than it did for professionals.
 * HUB's API surface includes the marketplace's own admin endpoints, Stripe
 * webhooks and the order routes; a population whose entire relationship with
 * the platform is commercial is exactly the one that must not be able to reach
 * them by hand. Every /seller page drives its writes through server actions,
 * which POST to their own route rather than to /api, so nothing under /seller
 * needs an exception.
 */
export function isVendorPath(pathname: string): boolean {
  return pathname === VENDOR_ROOT || pathname.startsWith(`${VENDOR_ROOT}/`);
}

/**
 * The single gate both HUB's middleware and each sibling app's calls.
 *
 * Returns the root a scoped account is confined to, or null when the scope has
 * the run of the app ('full'). Centralised so that adding a fourth scope later
 * is one case here rather than a new conditional in three middlewares.
 */
export function confinedRoot(scope: AccountScope): string | null {
  if (scope === "uhn") return PRO_ROOT;
  if (scope === "vendor") return VENDOR_ROOT;
  return null;
}

/**
 * May a 'uhn' account reach this path in CNS?
 *
 * CNS assumes every signed-in user is a nurse — the LMS, the instructor tools
 * and the ~9k-post library all sit behind nothing but the session. Dropping
 * CNS's scope redirect without this list would not "give professionals the job
 * board", it would give them all of that. So the allowlist is the job board and
 * its immediate dependencies, and nothing else.
 */
const CNS_PROFESSIONAL_PREFIXES = [
  "/jobs",
  "/saved",
  // Every job listing links to the employer behind it. Omitting this makes the
  // hospital's name on a job page a dead end for the one population most likely
  // to click it.
  "/employers",
];

// NOT "/applications". CNS has a page at that path, but it is the NURSE's
// applications list. A professional's lives in HUB at /pro/applications, which
// is the one place their account now lives. Allowing both would mean two
// screens answering the same question from the same table, and only one of them
// carrying the withdraw button.

export function isCnsProfessionalPath(pathname: string): boolean {
  return CNS_PROFESSIONAL_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/**
 * May a 'vendor' account reach this path in CNS? No. Never. Not one.
 *
 * This exists as a FUNCTION rather than as an inline `return false` in CNS's
 * middleware so the rule is stated in the mirrored file alongside the other
 * two, and so a future "vendors should see the course catalogue" request is a
 * one-line change here that the drift check will carry to every repo — rather
 * than a fourth place someone has to remember exists.
 *
 * A vendor sells equipment. CNS is nurse education: the LMS, the instructor
 * tools, the library. There is no page there that a seller has business on,
 * and the shared session means "not linked in their nav" is not a control.
 */
export function isCnsVendorPath(_pathname: string): boolean {
  return false;
}

/**
 * The sibling-app gate, keyed by scope. CNS and UHN both call this.
 *
 * Returns true when the scope may reach that path in the sibling app. 'full'
 * (nurse) is CNS's native population and is unrestricted there — this function
 * has no opinion about them, matching how the two prefix lists above are only
 * consulted for a scoped account.
 */
export function mayEnterCns(scope: AccountScope, pathname: string): boolean {
  if (scope === "uhn") return isCnsProfessionalPath(pathname);
  if (scope === "vendor") return isCnsVendorPath(pathname);
  return true;
}

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
  return toAccountScope((appMeta as { scope?: unknown }).scope);
}

/**
 * Normalise an arbitrary database value to a scope. Unknown values fail safe.
 *
 * "Fail safe" here means 'full', which is the LEAST confined scope — and that
 * is deliberate rather than an oversight. An unrecognised value must not be
 * able to lock a real nurse out of the app she has always had; every account
 * that predates the scoped populations has no value at all, and the sessions
 * minted before each scope existed carry no claim. Confinement is opt-in, and
 * the guard in migration 0001 §3 is what stops anyone opting themselves out of
 * it: account_scope is platform_admin-writable only, so a 'vendor' row cannot
 * become a 'full' one by request.
 */
export function toAccountScope(value: unknown): AccountScope {
  if (value === "uhn") return "uhn";
  if (value === "vendor") return "vendor";
  return "full";
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
 *
 * The "uhn" key is a stored value in users.preferred_home, so it keeps its name
 * even though it now opens HUB's /pro rather than the UHN host. Renaming it to
 * "pro" would make toHomeKey() reject every preference already saved, silently
 * dropping people back to the computed default.
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
  // A CONFINED SCOPE HAS EXACTLY ONE HOME, and the stored preference cannot
  // override it. This has to be checked before anything else: a seller who was
  // a nurse yesterday still has "feed" saved in users.preferred_home from back
  // when that was a legal choice, and honouring it would send them to a page
  // middleware then bounces — an infinite redirect between /home and /seller,
  // not merely a wrong landing.
  if (facts.scope === "vendor") return "vendor";

  const eligible = (key: HomeKey): boolean => {
    if (key === "uhn") return facts.scope === "uhn";
    if (key === "org") return facts.scope === "uhn" && !!facts.isOrgAdmin;
    if (key === "instructor") return !!facts.isInstructor;
    if (key === "vendor") return !!facts.isVendor;
    return facts.scope === "full"; // "feed"
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
    // HUB-relative, like "feed" and "vendor" below: the professional's home is
    // now a route in this app, not a sibling host.
    case "uhn":
      return PRO_ROOT;
    case "org":
      return `${uhn}/org`;
    case "instructor":
      return `${cns}/instructor`;
    // The seller's own portal, not the old page inside the nurse shop. Both a
    // 'vendor'-scoped account and a nurse who happens to sell land here — the
    // PAGES are the same for both, only the surrounding shell differs (see
    // app/(platform)/seller/layout.tsx).
    case "vendor":
      return VENDOR_ROOT;
    default:
      return "/home";
  }
}

/** Convenience: facts in, URL out. */
export function resolveHome(facts: HomeFacts): string {
  return homeUrl(resolveHomeKey(facts));
}

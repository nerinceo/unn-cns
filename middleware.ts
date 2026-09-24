import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  REMEMBER_ME_COOKIE,
  withAuthCookieOptions,
} from "@/lib/auth/cookie-config";
import { confinedRoot, mayEnterCns, scopeFromClaims } from "@/lib/access";

/**
 * CNS auth gate.
 *
 * Deliberately the INVERSE of HUB's. HUB uses a `protectedPaths` allowlist
 * because it has genuinely public surface (marketing, /demo, /welcome). CNS is
 * members-only, so everything is protected except a tiny denylist — fail-closed,
 * meaning a new route can never accidentally ship unauthenticated.
 *
 * CNS has NO auth UI at all: no /login, /signup, /reset-password. Not stubs —
 * absent. Authentication lives entirely in HUB, and a file that does not exist
 * cannot drift out of sync with it. Unauthenticated visitors are sent to HUB.
 */

/**
 * The only unauthenticated surface.
 *
 * Each entry is a deliberate exception to the fail-closed default and needs a
 * reason:
 *   /api/health — liveness probe, leaks nothing but build identity.
 *   /r/         — shared resume links. The entire point is that a recruiter
 *                 with no UNN account can open one. Access is gated on a
 *                 32-char random token resolved by a SECURITY DEFINER function,
 *                 so an unknown token returns nothing and nothing is
 *                 enumerable. Pages are marked noindex.
 *   /jobs       — job listings must be CRAWLABLE for schema.org/JobPosting
 *                 markup to reach Google for Jobs, which is the only realistic
 *                 acquisition channel for a new board. RLS exposes only
 *                 published jobs from approved employers to `anon`; drafts and
 *                 applications stay private, and applying requires a session.
 *   /employers/ — an employer's public profile and its open roles. Same
 *                 argument as /jobs, and the sitemap declares these: a
 *                 hospital's own name is a search a nurse actually makes, and
 *                 a page that redirects Googlebot to HUB is not indexable.
 *                 Only APPROVED employers resolve (the page 404s otherwise),
 *                 and it renders nothing RLS does not already expose to anon.
 *   /robots.txt, /sitemap.xml — needed for the above to be discovered.
 *   /api/cron/  — Vercel cron invokes these with no session, so the auth gate
 *                 would redirect them and the job would silently never run.
 *                 Each route authenticates itself against CNS_CRON_SECRET
 *                 instead; letting them past middleware is required, not lax.
 *
 * Anything added here is public to the internet. Justify it in review.
 */
const PUBLIC_PATHS = [
  "/api/health",
  "/api/cron/",
  "/r/",
  "/jobs",
  "/employers/",
  "/robots.txt",
  "/sitemap.xml",
];

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? "https://unn.nerusalem.com";

/**
 * Signing in happens on nerusalem.com now, for all three apps.
 *
 * CNS has never had a login page of its own and still does not — this only
 * changes WHERE a signed-out visitor is sent. It used to be HUB's /welcome,
 * which then had to be clicked through to a sign-in form; those forms have moved
 * off the apps onto nerusalem.com, which is the only place that enforces
 * two-factor, bounds password guessing and refuses a suspended account.
 *
 * Not env-driven: these are static pages on separate hosting, so a preview
 * deployment has no copy of its own to point at.
 *
 * Mirrors ACCOUNT_SITE_URL in unn-platform and unn-uhn lib/site-url.ts. Not a
 * drift-checked file (see docs/SHARED-WITH-HUB.md), but keep the value in step.
 */
const ACCOUNT_SITE_URL = "https://nerusalem.com";
const OWN_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cns.nerusalem.com";

/**
 * The sign-in page, carrying where to come back to.
 *
 * `next` has to be absolute — the visitor is being sent to another origin, which
 * cannot resolve a CNS path. That page only honours hosts under nerusalem.com,
 * so on a preview deployment the value is simply ignored and the visitor lands
 * on their normal home instead of being sent somewhere wrong.
 */
function signInUrl(next?: string): string {
  const base = `${ACCOUNT_SITE_URL}/signin.html`;
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}

export async function middleware(request: NextRequest) {
  // Pre-SSO escape hatch. Until NEXT_PUBLIC_COOKIE_DOMAIN is live on HUB, the
  // session cookie is host-only and never reaches this app, so every visitor
  // would look logged out and bounce to HUB forever. This flag keeps the
  // domain serving a real page in the meantime.
  //
  // Fail-closed: it must be set to exactly "1" to relax the gate. Turning CNS
  // on is then just unsetting one env var. DELETE this block once SSO is
  // verified in production.
  if (process.env.CNS_PUBLIC_PREVIEW === "1") {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });
  const remember = request.cookies.get(REMEMBER_ME_COOKIE)?.value === "1";

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            // Identical cookie handling to HUB. If this diverges, a rotation
            // performed here writes cookies HUB cannot read (or vice versa)
            // and the shared session breaks. See docs/SHARED-WITH-HUB.md.
            supabaseResponse.cookies.set(
              name,
              value,
              withAuthCookieOptions(options, remember)
            );
          });
        },
      },
    }
  );

  // Verifies the JWT locally against the project's JWKS — same call HUB makes,
  // and the reason SSO costs nothing: the session was minted by HUB but is
  // verifiable here without a network hop or a second user table.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  const path = request.nextUrl.pathname;

  // The instructor dashboard moved to UHN.
  //
  // CNS still DELIVERS courses — the player, lessons, enrolments and the
  // ~9k-post library are all still here. Only the authoring desk left, because
  // authoring is operator work and UHN is the operator app.
  //
  // Placed before the public-path check so it also catches a signed-out visitor
  // following an old /instructor bookmark: UHN owns signing in for its own
  // routes, and bouncing them through CNS's sign-in first would authenticate
  // them here and still have nowhere to put them.
  //
  // Every sub-path collapses to /teaching, which resolves the caller's own
  // portal — the old paths carried no instructor id.
  if (path === "/instructor" || path.startsWith("/instructor/")) {
    const uhn = (process.env.NEXT_PUBLIC_UHN_URL ?? "https://uhn.nerusalem.com").replace(/\/+$/, "");
    return NextResponse.redirect(`${uhn}/teaching`);
  }

  // A PUBLIC PATH IS PUBLIC TO STRANGERS — IT IS NOT AN EXEMPTION FROM
  // CONFINEMENT.
  //
  // This check used to sit below the PUBLIC_PATHS return, which meant the one
  // public page with a signed-in experience leaked: /jobs is deliberately
  // crawlable, so a marketplace vendor typing it reached the board and was
  // served the personalised, nurse-targeted version of it ("Get roles matched
  // to you"). Five of the six CNS surfaces ejected them correctly and this one
  // did not, purely because of the order of two ifs.
  //
  // Keyed off `user`, so nothing changes for the anonymous visitor the public
  // list exists for: a crawler and a signed-out nurse still get /jobs,
  // /employers, the health check and the sitemap exactly as before. Only an
  // account that HAS a scope is measured against it, and mayEnterCns() still
  // admits professionals to the board — it answers false only for vendors.
  if (user) {
    const scope = scopeFromClaims(user);
    if (!mayEnterCns(scope, path)) {
      // Each scope goes to its own home, not to a generic one: a page that
      // refuses them on arrival is not a redirect, it is a loop.
      return NextResponse.redirect(new URL(confinedRoot(scope) ?? "/", HUB_URL));
    }
  }

  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return supabaseResponse;

  if (!user) {
    // Straight to the sign-in page, never to a local login page — CNS has none.
    // Carrying the intended page means a library or course link shared with a
    // signed-out nurse opens that page after signing in, instead of dropping her
    // on a generic home screen with no idea what she was sent.
    const intended = `${OWN_SITE_URL.replace(/\/+$/, "")}${path}${request.nextUrl.search}`;
    return NextResponse.redirect(signInUrl(intended));
  }

  // Non-nurse healthcare professionals may use the JOB BOARD here, and nothing
  // else.
  //
  // This was an unconditional redirect to uhn.nerusalem.com. It is now an
  // allowlist, because the professional's jobs and applications data already
  // lives in CNS tables (cns_jobs, cns_job_applications) and the board is the
  // one part of this app that was ever meant for them.
  //
  // The allowlist is the load-bearing half. Everything else in CNS — the LMS,
  // the instructor tools, the library — is gated by nothing but a session, so
  // removing the redirect WITHOUT this check would hand a professional the
  // entire nursing curriculum rather than a job board. The two halves must ship
  // together; neither is safe alone.
  //
  // Sent to HUB's /pro rather than to UHN: that is their home now, and it is
  // the only page guaranteed to render for them.
  //
  // MARKETPLACE VENDORS ARE REFUSED OUTRIGHT — mayEnterCns() answers false for
  // every path when the scope is 'vendor', and that is the entire reason this
  // branch is keyed off the shared helper rather than off `=== "uhn"`.
  //
  // CNS and HUB share one Supabase project and one `.nerusalem.com` session
  // cookie, so a seller who signs in at HUB is ALREADY signed in here. Adding
  // the vendor scope in HUB alone would not have isolated them; it would only
  // have changed where they land, leaving the LMS, the instructor tools and the
  // ~9k-post library one typed URL away behind nothing but that session. The
  // old `=== "uhn"` test would have read 'vendor' as "not a professional,
  // therefore a nurse" and let them straight through.
  //
  // THE CHECK ITSELF NOW RUNS ABOVE, before the public-path return, so that a
  // confined account is refused on /jobs too. It is deliberately not repeated
  // here: one gate, one place to change it.

  return supabaseResponse;
}

export const config = {
  // Mirrors HUB's matcher: skip build output, the image optimizer, crawler
  // files and static media. Page navigations and RSC prefetches still pass
  // through, which is the only place the auth gate matters.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp3|woff|woff2|ttf)$).*)",
  ],
};

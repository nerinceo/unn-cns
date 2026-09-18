#!/usr/bin/env node
/**
 * Drift check for the files mirrored from unn-platform (HUB).
 *
 * CNS is a separate repo on purpose, so a CNS commit can never break HUB's
 * production build. The cost is a handful of files living in both repos with
 * nothing but discipline keeping them in sync. docs/SHARED-WITH-HUB.md is the
 * manifest; this script enforces it.
 *
 * The auth files are the ones that matter. Both apps share ONE session, which
 * works only because both write the Supabase auth cookies with the same
 * `domain`. If cookie handling diverges, a rotation in one app writes cookies
 * the other cannot read, Supabase's refresh-token reuse detection fires, and
 * users get signed out of BOTH apps intermittently with no obvious cause.
 *
 * Usage:
 *   npm run check:drift                      # assumes ../unn-platform
 *   HUB_REPO_PATH=/path/to/unn-platform npm run check:drift
 *
 * Exits 1 on drift so it can gate a pre-push hook or CI job.
 *
 * WHY LINE ENDINGS ARE NORMALISED: the two repos are checked out with
 * different autocrlf settings — HUB's working tree is CRLF, CNS's is LF. A
 * raw byte compare reports all 13 files as drifted, every run, which is how a
 * check gets ignored and then deleted. Only real content differences count.
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CNS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HUB_ROOT = resolve(
  process.env.HUB_REPO_PATH || join(CNS_ROOT, "..", "unn-platform")
);
/**
 * UHN is checked too, where it can be.
 *
 * It was not, and that was the gap: `lib/access.ts` exists in THREE repos and
 * routes every account to the app it belongs to, but only two of them were
 * compared. UHN's copy had already lost its UHN_URL export once, caught by a
 * typecheck during an unrelated release rather than by anything deliberate.
 *
 * It could not be registered before because UHN's copy carried UHN-only
 * constants (UHN_SCOPE, UHN_ROLE, JOB_TITLE_*). Those moved to
 * unn-uhn/lib/uhn/account-constants.ts, so the file is now comparable exactly.
 *
 * Missing UHN is NOT an error — a machine with only two of the three clones
 * still gets a useful HUB↔CNS run.
 */
const UHN_ROOT = resolve(
  process.env.UHN_REPO_PATH || join(CNS_ROOT, "..", "unn-uhn")
);

/**
 * mode: "exact"  — must be identical after line-ending normalisation.
 * mode: "prefix" — HUB's content must appear verbatim at the top of CNS's.
 *                  Used where CNS legitimately appends its own rules; it still
 *                  catches an edit to any SHARED line, which is the real risk.
 */
/**
 * `uhn: true` additionally compares HUB's copy against the UHN clone.
 *
 * Only set on files that are genuinely byte-identical there. Three shared files
 * are deliberately NOT marked, because UHN's copies carry app-specific prose
 * that is accurate and worth keeping:
 *
 *   lib/auth/cookie-config.ts — same code, but UHN's comments explain why its
 *     NEXT_PUBLIC_COOKIE_DOMAIN is blank rather than ".unnhub.org". The real
 *     contract for this file is the ENV VAR, not the source, and that cannot
 *     drift because both read the same deployment config.
 *   lib/supabase/client.ts, lib/supabase/server.ts — same shape, UHN-specific
 *     notes on its own auth surface.
 *
 * Forcing byte-identity on those would delete correct documentation to satisfy
 * a checker. Registering the other eight is still a large improvement over the
 * zero coverage UHN had.
 */
const MIRRORED = [
  { path: "lib/auth/cookie-config.ts", mode: "exact", critical: true },
  { path: "lib/supabase/client.ts", mode: "exact", critical: true },
  { path: "lib/supabase/server.ts", mode: "exact", critical: true },
  { path: "lib/supabase/admin.ts", mode: "exact", critical: true, uhn: true },
  // Routes an account to the app it belongs to (scope + home destination), and
  // now also carries the allowlists deciding what a 'uhn' account may reach in
  // HUB and in CNS. Drift here does not throw — it silently lands people in the
  // wrong app, in no app at all, or lets a professional reach a page one of the
  // other two apps would have refused.
  { path: "lib/access.ts", mode: "exact", critical: true, uhn: true },
  // The public.users column allowlist. Must match BOTH the grant in migration
  // 0024 and the other repos' copies: a column granted in SQL but missing here
  // reads back as absent, and one named here but not granted errors the whole
  // query with 42501 — which is what took CNS down when 0024 first ran.
  { path: "lib/users/columns.ts", mode: "exact", critical: true, uhn: true },
  // Rich-text allowlist. docs/SHARED-WITH-HUB.md has always listed this as
  // mirrored; it just was not enforced. Drift lets one app render markup the
  // other strips — an XSS gap in whichever side is more permissive.
  { path: "lib/sanitize.ts", mode: "exact" },
  { path: "lib/utils/cn.ts", mode: "exact", uhn: true },
  { path: "components/ui/button.tsx", mode: "exact" },
  { path: "components/ui/input.tsx", mode: "exact", uhn: true },
  // Not uhn: UHN's badge is a strict SUPERSET (semantic variants plus a `dot`
  // affordance) added for its status columns. HUB's professional shell uses its
  // own copy at components/pro/ui/badge.tsx rather than widening this one,
  // because the extra base classes would change every badge HUB renders.
  { path: "components/ui/badge.tsx", mode: "exact" },
  { path: "components/ui/avatar.tsx", mode: "exact", uhn: true },
  { path: "components/ui/tabs.tsx", mode: "exact", uhn: true },
  { path: "components/ui/textarea.tsx", mode: "exact", uhn: true },
  { path: "tailwind.config.ts", mode: "exact" },
  // CNS appends a .resume-doc block for the ATS-parseable resume document.
  // The shared part above it — including the load-bearing
  // `.dark .bg-white { … !important }` rules — must stay identical.
  { path: "app/globals.css", mode: "prefix" },
];

const norm = (s) => s.replace(/\r\n/g, "\n");
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);

if (!existsSync(HUB_ROOT)) {
  console.error(`\n  Cannot find the HUB checkout at:\n    ${HUB_ROOT}\n`);
  console.error(`  Set HUB_REPO_PATH to point at your unn-platform clone.\n`);
  process.exit(2);
}

const drifted = [];
const missing = [];
const rows = [];

// A UHN clone is optional. Without it the HUB↔CNS run is unchanged and the
// UHN column is simply reported as skipped, so this never fails a machine that
// has only two of the three repos checked out.
const haveUhn = existsSync(UHN_ROOT);

for (const { path: rel, mode, critical, uhn: alsoUhn } of MIRRORED) {
  const hubPath = join(HUB_ROOT, rel);
  const cnsPath = join(CNS_ROOT, rel);

  if (!existsSync(hubPath) || !existsSync(cnsPath)) {
    missing.push({ rel, which: !existsSync(hubPath) ? "HUB" : "CNS" });
    rows.push(["MISSING", rel, !existsSync(hubPath) ? "not in HUB" : "not in CNS"]);
    continue;
  }

  const hub = norm(readFileSync(hubPath, "utf8"));
  const cns = norm(readFileSync(cnsPath, "utf8"));

  const ok = mode === "prefix" ? cns.startsWith(hub) : hub === cns;

  const notes = [];
  if (ok) {
    if (mode === "prefix" && cns.length > hub.length) {
      notes.push(`+${cns.slice(hub.length).split("\n").length - 1} CNS-only lines`);
    }
  } else {
    drifted.push({ rel, critical, mode, which: "CNS" });
    notes.push(
      mode === "prefix" ? "shared prefix was edited" : `hub:${sha(hub)} cns:${sha(cns)}`
    );
  }

  // The third copy. Compared against HUB, which is the origin for all of them.
  let uhnOk = true;
  if (alsoUhn && haveUhn) {
    const uhnPath = join(UHN_ROOT, rel);
    if (!existsSync(uhnPath)) {
      missing.push({ rel, which: "UHN" });
      notes.push("not in UHN");
      uhnOk = false;
    } else {
      const uhnSrc = norm(readFileSync(uhnPath, "utf8"));
      if (uhnSrc !== hub) {
        drifted.push({ rel, critical, mode, which: "UHN" });
        notes.push(`UHN drift hub:${sha(hub)} uhn:${sha(uhnSrc)}`);
        uhnOk = false;
      } else {
        notes.push("uhn ok");
      }
    }
  }

  rows.push([ok && uhnOk ? "ok" : "DRIFT", rel, notes.join("  ")]);
}

const width = Math.max(...rows.map(([, rel]) => rel.length));
console.log(
  `\n  HUB: ${HUB_ROOT}\n  CNS: ${CNS_ROOT}\n  UHN: ${
    haveUhn ? UHN_ROOT : "(not found — UHN checks skipped)"
  }\n`
);
for (const [status, rel, note] of rows) {
  const mark = status === "ok" ? "  ok   " : `  ${status}`;
  console.log(`${mark} ${rel.padEnd(width)}  ${note}`);
}

if (!drifted.length && !missing.length) {
  console.log(`\n  All ${MIRRORED.length} mirrored files are in sync.\n`);
  process.exit(0);
}

console.error("");
if (drifted.some((d) => d.critical)) {
  console.error(
    "  An AUTH file has drifted. Both apps share one session through these\n" +
      "  files; a divergence here signs users out of BOTH apps intermittently.\n" +
      "  Reconcile before deploying either repo.\n"
  );
}
console.error(
  `  ${drifted.length} drifted, ${missing.length} missing. ` +
    `Reconcile and update the SHA in docs/SHARED-WITH-HUB.md.\n`
);
process.exit(1);

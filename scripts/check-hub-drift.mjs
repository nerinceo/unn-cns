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
 * mode: "exact"  — must be identical after line-ending normalisation.
 * mode: "prefix" — HUB's content must appear verbatim at the top of CNS's.
 *                  Used where CNS legitimately appends its own rules; it still
 *                  catches an edit to any SHARED line, which is the real risk.
 */
const MIRRORED = [
  { path: "lib/auth/cookie-config.ts", mode: "exact", critical: true },
  { path: "lib/supabase/client.ts", mode: "exact", critical: true },
  { path: "lib/supabase/server.ts", mode: "exact", critical: true },
  { path: "lib/supabase/admin.ts", mode: "exact", critical: true },
  { path: "lib/utils/cn.ts", mode: "exact" },
  { path: "components/ui/button.tsx", mode: "exact" },
  { path: "components/ui/input.tsx", mode: "exact" },
  { path: "components/ui/badge.tsx", mode: "exact" },
  { path: "components/ui/avatar.tsx", mode: "exact" },
  { path: "components/ui/tabs.tsx", mode: "exact" },
  { path: "components/ui/textarea.tsx", mode: "exact" },
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

for (const { path: rel, mode, critical } of MIRRORED) {
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

  if (ok) {
    const extra =
      mode === "prefix" && cns.length > hub.length
        ? `+${cns.slice(hub.length).split("\n").length - 1} CNS-only lines`
        : "";
    rows.push(["ok", rel, extra]);
  } else {
    drifted.push({ rel, critical, mode });
    rows.push([
      "DRIFT",
      rel,
      mode === "prefix"
        ? "shared prefix was edited"
        : `hub:${sha(hub)} cns:${sha(cns)}`,
    ]);
  }
}

const width = Math.max(...rows.map(([, rel]) => rel.length));
console.log(`\n  HUB: ${HUB_ROOT}\n  CNS: ${CNS_ROOT}\n`);
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

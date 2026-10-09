#!/usr/bin/env node
/**
 * One-shot setup + deploy for the CNS Vercel project.
 *
 * Idempotent: safe to re-run. Creates the project only if missing, upserts env
 * vars, attaches the domain, then deploys.
 *
 * SAFETY. This script must never be able to touch unn-platform (HUB
 * production or its staging preview). Three independent guards enforce that:
 *   1. It refuses to run unless invoked from the unn-cns directory.
 *   2. The HUB project id is hardcoded as a denylist and asserted against
 *      every project id it resolves.
 *   3. It only ever addresses the project literally named "unn-cns".
 *
 * Usage:  node scripts/deploy.mjs            (setup + production deploy)
 *         node scripts/deploy.mjs --setup    (setup only, no deploy)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
import { resolve, basename } from "path";

const PROJECT_NAME = "unn-cns";
const DOMAIN = "cns.nerusalem.com";
// HUB. Never to be addressed by this script.
const FORBIDDEN_PROJECT_IDS = ["prj_d8YQ5Z1e5MKfl02JdZgowtTfbH8A"];
const FORBIDDEN_NAMES = ["unn-platform"];

const AUTH = "C:/Users/Naveen/AppData/Roaming/com.vercel.cli/Data/auth.json";
const API = "https://api.vercel.com";

// ---- guard 1: correct working directory -----------------------------------
const cwd = process.cwd();
if (basename(cwd) !== "unn-cns" || !existsSync(resolve(cwd, "middleware.ts"))) {
  console.error(`REFUSING: must run from the unn-cns directory. cwd=${cwd}`);
  process.exit(1);
}

const token = JSON.parse(readFileSync(AUTH, "utf8")).token;
if (!token) { console.error("No Vercel token in auth.json — run `vercel login`."); process.exit(1); }

let teamId = null;

async function api(path, opts = {}) {
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}${teamId ? `teamId=${teamId}` : ""}`;
  let res;
  try {
    res = await fetch(url, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });
  } catch (e) {
    console.error(
      `\nNetwork error reaching ${API}.\n` +
        `Check outbound connectivity, then re-run — this script is idempotent.\n` +
        `  quick test:  curl -sS -o NUL -w "%{http_code}\\n" https://api.vercel.com\n` +
        `  cause: ${e?.cause?.code ?? e.message}\n`
    );
    process.exit(1);
  }
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

/** Guard 2/3: nothing that resolves to HUB may proceed. */
function assertNotHub(project) {
  if (!project) return;
  if (FORBIDDEN_PROJECT_IDS.includes(project.id) || FORBIDDEN_NAMES.includes(project.name)) {
    console.error(`ABORT: refusing to operate on ${project.name} (${project.id}).`);
    process.exit(1);
  }
}

// Only the capabilities CNS is permitted. Absent by design: STRIPE_*,
// RESEND_API_KEY, FIREBASE_*, R2_DIGITAL_BUCKET, CRON_SECRET.
const ENV_FROM_LOCAL = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
  // Question bank source (lib/cns/bank-source.ts). The content key can only
  // EXECUTE the qbank_* read functions in the unn-content project.
  "QB_SOURCE",
  "CONTENT_SUPABASE_URL",
  "CONTENT_SUPABASE_SECRET_KEY",
  // ADZUNA_* / JOOBLE_API_KEY are no longer synced here: the job import moved
  // to UHN (unn-uhn/lib/jobs-import) on 2026-10-09 and its deploy carries them.
];

const ENV_LITERAL = {
  NEXT_PUBLIC_HUB_URL: "https://unn.nerusalem.com",
  NEXT_PUBLIC_SITE_URL: "https://cns.nerusalem.com",
  // THE linchpin of SSO. Must be byte-identical to HUB's value — a mismatch
  // means each app writes cookies the other cannot read, and refresh-token
  // rotation then trips Supabase's reuse detection and revokes the family.
  NEXT_PUBLIC_COOKIE_DOMAIN: ".nerusalem.com",
  // CNS_PUBLIC_PREVIEW is deliberately absent: it disabled the auth gate
  // entirely so the domain could serve pages before SSO existed. Re-adding it
  // makes the whole member area public. It is already unset on Vercel.
};

function localEnv() {
  const src = readFileSync(resolve(cwd, ".env"), "utf8");
  const out = {};
  for (const k of ENV_FROM_LOCAL) {
    const m = src.match(new RegExp(`^${k}=(.*)$`, "m"));
    if (m && m[1].trim()) out[k] = m[1].trim();
  }
  return out;
}

async function main() {
  const setupOnly = process.argv.includes("--setup");

  // ---- team -------------------------------------------------------------
  const teams = await api("/v2/teams");
  if (teams.status !== 200) { console.error("Cannot reach Vercel:", teams.status, teams.body); process.exit(1); }
  const team = (teams.body.teams || []).find((t) => t.slug === "nerusalem") || (teams.body.teams || [])[0];
  teamId = team?.id ?? null;
  console.log(`team: ${team?.slug ?? "(personal account)"}`);

  // ---- project ----------------------------------------------------------
  let project = (await api(`/v9/projects/${PROJECT_NAME}`)).body;
  if (project?.id) {
    assertNotHub(project);
    console.log(`project exists: ${project.name} (${project.id})`);
  } else {
    const created = await api("/v11/projects", {
      method: "POST",
      body: JSON.stringify({ name: PROJECT_NAME, framework: "nextjs" }),
    });
    if (created.status >= 300) { console.error("create failed:", created.status, created.body); process.exit(1); }
    project = created.body;
    assertNotHub(project);
    console.log(`project created: ${project.name} (${project.id})`);
  }

  // Node 22.x explicitly. 20.x is deprecated on Vercel (builds refused from
  // 2026-10-01); 24.x has caused build failures on this account; 22 is an LTS
  // line and what every local build is run on. The create endpoint rejects
  // nodeVersion, so it has to be a follow-up PATCH.
  const NODE = "22.x";
  if (project.nodeVersion !== NODE) {
    const nv = await api(`/v9/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ nodeVersion: NODE }),
    });
    console.log(`node version: ${nv.status < 300 ? NODE : `FAILED ${nv.status}`}`);
  }

  // ---- env vars ---------------------------------------------------------
  const desired = { ...localEnv(), ...ENV_LITERAL };
  const existing = (await api(`/v10/projects/${project.id}/env?decrypt=false`)).body?.envs || [];

  for (const [key, value] of Object.entries(desired)) {
    const prior = existing.find((e) => e.key === key && e.target?.includes("production"));
    if (prior) {
      await api(`/v9/projects/${project.id}/env/${prior.id}`, {
        method: "PATCH",
        body: JSON.stringify({ value }),
      });
      console.log(`  env ~ ${key}`);
    } else {
      const r = await api(`/v10/projects/${project.id}/env`, {
        method: "POST",
        body: JSON.stringify({
          key, value, type: "encrypted",
          target: ["production", "preview", "development"],
        }),
      });
      console.log(`  env + ${key}${r.status >= 300 ? ` (FAILED ${r.status})` : ""}`);
    }
  }

  // ---- domain -----------------------------------------------------------
  const dom = await api(`/v10/projects/${project.id}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: DOMAIN }),
  });
  if (dom.status < 300) console.log(`domain attached: ${DOMAIN}`);
  else if (dom.body?.error?.code === "domain_already_in_use" || dom.status === 409)
    console.log(`domain already attached: ${DOMAIN}`);
  else console.log(`domain: ${dom.status} ${JSON.stringify(dom.body?.error ?? dom.body).slice(0, 200)}`);

  // ---- link locally so the CLI targets THIS project ----------------------
  mkdirSync(resolve(cwd, ".vercel"), { recursive: true });
  writeFileSync(
    resolve(cwd, ".vercel/project.json"),
    JSON.stringify({ projectId: project.id, orgId: teamId ?? project.accountId }, null, 2)
  );
  console.log("linked .vercel/project.json");

  if (setupOnly) { console.log("\nsetup complete (--setup: no deploy)"); return; }

  // ---- deploy -----------------------------------------------------------
  console.log("\ndeploying...");
  // No --token: the CLI has its own refreshed credentials, and passing it here
  // would put the secret into argv, where it shows up in process listings and
  // in any error dump. shell:true because Windows cannot spawn npx.cmd
  // directly without one (EINVAL).
  execFileSync("npx", ["vercel", "deploy", "--prod", "--yes"], {
    stdio: "inherit",
    cwd,
    shell: true,
  });
}

main().catch((e) => { console.error(e); process.exit(1); });

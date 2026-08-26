/**
 * Split leaf topics whose questions belong to two different units.
 *
 * The tree keys a leaf on (topic_code, topic_name) and a unit on
 * (unit_code, unit_name). That is enough almost everywhere, but the source has
 * cases where one topic name appears under two DIFFERENT unit names — e.g.
 * NF1_U1 is written both "Introduction to Nursing" and "Introduction to Nursing
 * and Nursing Profession". Those questions share one leaf, a leaf has exactly
 * one parent, so the minority group ends up displaying the majority's unit.
 *
 * This gives each (leaf, unit) combination its own leaf node and re-points the
 * affected questions. Question content is never touched — only the node a
 * question hangs from.
 *
 *   node scripts/repair-unit-parents.mjs           # dry run
 *   node scripts/repair-unit-parents.mjs --apply
 */
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const T = env.NEXT_PUBLIC_SUPABASE_URL;
const th = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" };
const SK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmYnFnbWljZG10aGhxb3Jsd2liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMTA3MjEsImV4cCI6MjA5NjY4NjcyMX0.Ln8wpOVvlEHACqzTurMDrCEzDhePilSn6FW8D8Hs0WA";
const S = "https://pfbqgmicdmthhqorlwib.supabase.co/rest/v1/qb_public_questions";
const sh = { apikey: SK, Authorization: "Bearer " + SK };

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const slugify = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const say = (...a) => console.log(...a);

async function all(url, headers) {
  let out = [], from = 0;
  for (;;) {
    const sep = url.includes("?") ? "&" : "?";
    const d = await (await fetch(`${url}${sep}offset=${from}&limit=1000`, { headers })).json();
    if (!Array.isArray(d)) { console.error("ERR", JSON.stringify(d).slice(0, 200)); break; }
    out = out.concat(d);
    if (d.length < 1000) break;
    from += 1000;
  }
  return out;
}
async function req(method, path, body) {
  const r = await fetch(`${T}/rest/v1/${path}`, {
    method, headers: { ...th, Prefer: method === "POST" ? "return=representation" : "return=minimal" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

const src = await all(`${S}?select=id,unit_code,unit_name,topic_code,topic_name&order=id.asc`, sh);
const srcById = new Map(src.map((r) => [String(r.id), r]));

const inst = await (await fetch(`${T}/rest/v1/cns_institutions?select=id&slug=eq.rguhs`, { headers: th })).json();
const iid = inst[0].id;
const topics = await all(`${T}/rest/v1/cns_topics?select=id,slug,name,parent_id,subject_id`, th);
const rows = await all(`${T}/rest/v1/cns_study_questions?select=id,source_ref,subject_id,topic_id&institution_id=eq.${iid}&status=eq.published`, th);

const byId = new Map(topics.map((t) => [t.id, t]));
const bySlug = new Map(topics.map((t) => [`${t.subject_id}|${t.slug}`, t]));

const fixes = [];
for (const q of rows) {
  const s = q.source_ref ? srcById.get(String(q.source_ref)) : null;
  if (!s || !norm(s.unit_name)) continue;
  const leaf = q.topic_id ? byId.get(q.topic_id) : null;
  if (!leaf) continue;
  const parent = leaf.parent_id ? byId.get(leaf.parent_id) : null;
  const shown = norm(parent?.name ?? leaf.name);
  if (shown === norm(s.unit_name)) continue;
  fixes.push({ q, s, leaf });
}

say(`questions under the wrong unit: ${fixes.length}`);
if (fixes.length === 0) { say("\nnothing to do."); process.exit(0); }

const grouped = new Map();
for (const f of fixes) {
  const k = `${f.q.subject_id}|${norm(f.s.unit_name)}|${norm(f.s.topic_name)}`;
  if (!grouped.has(k)) grouped.set(k, []);
  grouped.get(k).push(f);
}

for (const [, group] of grouped) {
  const { q, s } = group[0];
  const sid = q.subject_id;
  const unitSlug = "u-" + slugify(s.unit_code) + "-" + slugify(norm(s.unit_name)).slice(0, 40);
  const leafSlug = "t-" + slugify(s.topic_code) + "-u-" + slugify(norm(s.unit_name)).slice(0, 30);

  say(`  ${group.length} x "${norm(s.topic_name)}" -> unit "${norm(s.unit_name)}"`);

  if (!APPLY) continue;

  let unit = bySlug.get(`${sid}|${unitSlug}`);
  if (!unit) {
    const [row] = await req("POST", "cns_topics", { subject_id: sid, slug: unitSlug, name: norm(s.unit_name), parent_id: null, is_published: true });
    unit = row; bySlug.set(`${sid}|${unitSlug}`, row); byId.set(row.id, row);
  }
  let leaf = bySlug.get(`${sid}|${leafSlug}`);
  if (!leaf) {
    const [row] = await req("POST", "cns_topics", { subject_id: sid, slug: leafSlug, name: norm(s.topic_name), parent_id: unit.id, is_published: true });
    leaf = row; bySlug.set(`${sid}|${leafSlug}`, row); byId.set(row.id, row);
  }
  for (const f of group) await req("PATCH", `cns_study_questions?id=eq.${f.q.id}`, { topic_id: leaf.id });
}

say(APPLY ? "\nAPPLIED." : "\nDRY RUN — pass --apply to write.");

/**
 * Make the CNS Nursing Bank an exact mirror of the source bank.
 *
 *   1. Remove the cns_seed_sample.sql demo rows (12 questions, 2 sets, its attempt).
 *   2. Relabel subjects to the canonical source name.
 *   3. Rebuild the unit/topic tree from source and re-point every question.
 *
 * Step 3 exists because the source reuses one code for genuinely different
 * nodes: MICRO_U2_T03 is both "Viruses" and "Fungi", CHN1_U3 is both
 * "Epidemiology and Communicable Disease Control" and "Family Health Nursing".
 * The importer keyed on code alone and merged them, so a student opening
 * "Fungi" also got Viruses questions. Keying on (code, name) splits them back.
 *
 * Subjects are relabelled rather than split: their three collisions are true
 * synonyms ("OBG Nursing I" / "Midwifery and Obstetrical Nursing I"), and
 * splitting would duplicate entries in the subject filter and double-count the
 * semester cards.
 */
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");

const env = Object.fromEntries(
  fs.readFileSync("d:/2026/unn-cns/.env", "utf8")
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
    if (!Array.isArray(d)) { console.error("ERR", JSON.stringify(d).slice(0, 250)); break; }
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

// ------------------------------------------------------------------- load
const src = await all(`${S}?select=id,subject_code,subject_name,unit_code,unit_name,topic_code,topic_name&order=id.asc`, sh);
const srcById = new Map(src.map((r) => [String(r.id), r]));

const inst = await (await fetch(`${T}/rest/v1/cns_institutions?select=id&slug=eq.rguhs`, { headers: th })).json();
const iid = inst[0].id;
const subjects = await all(`${T}/rest/v1/cns_subjects?select=id,slug,name&institution_id=eq.${iid}`, th);
let topics = await all(`${T}/rest/v1/cns_topics?select=id,slug,name,subject_id,parent_id`, th);

const study = await all(`${T}/rest/v1/cns_study_questions?select=id,source_ref,subject_id,topic_id&institution_id=eq.${iid}&status=eq.published`, th);
const mcq = await all(`${T}/rest/v1/cns_questions?select=id,source_ref,subject_id,topic_id&institution_id=eq.${iid}`, th);

// -------------------------------------------------- 1. seed sample removal
const seedQs = mcq.filter((q) => String(q.source_ref ?? "").startsWith("seed-"));
const seedSets = await all(`${T}/rest/v1/cns_question_sets?select=id,slug&institution_id=eq.${iid}&slug=in.(anatomy-practice-1,fon-practice-1)`, th);
say(`[1] seed removal — ${seedQs.length} questions, ${seedSets.length} sets`);
if (APPLY) {
  for (const s of seedSets) {
    for (const a of await all(`${T}/rest/v1/cns_attempts?select=id&set_id=eq.${s.id}`, th)) {
      await req("DELETE", `cns_attempts?id=eq.${a.id}`);
      say(`    deleted attempt ${a.id}`);
    }
    await req("DELETE", `cns_question_sets?id=eq.${s.id}`);
    say(`    deleted set ${s.slug}`);
  }
  for (const q of seedQs) await req("DELETE", `cns_questions?id=eq.${q.id}`);
  say(`    deleted ${seedQs.length} seed questions (cascades options/items/stats/responses)`);
}

// Live questions only, joined to their source row.
const linked = [...study, ...mcq]
  .filter((r) => r.source_ref && srcById.has(String(r.source_ref)))
  .map((r) => ({ ...r, kind: study.includes(r) ? "study" : "mcq", src: srcById.get(String(r.source_ref)) }));

// ----------------------------------------------------- 2. subject relabels
const subjTally = new Map();
for (const r of linked) {
  if (!r.subject_id) continue;
  if (!subjTally.has(r.subject_id)) subjTally.set(r.subject_id, new Map());
  const m = subjTally.get(r.subject_id), n = norm(r.src.subject_name);
  if (n) m.set(n, (m.get(n) ?? 0) + 1);
}
const pick = (m) => { let w = null, n = -1; for (const [k, c] of m) if (c > n || (c === n && k.length > (w?.length ?? 0))) { w = k; n = c; } return w; };

const subjFixes = [];
for (const s of subjects) {
  const m = subjTally.get(s.id);
  if (!m?.size) continue;
  const best = pick(m);
  if (best && norm(s.name) !== best) subjFixes.push({ id: s.id, slug: s.slug, from: s.name, to: best });
}
say(`\n[2] subject relabels: ${subjFixes.length}`);
subjFixes.forEach((f) => say(`    ${f.slug}: "${f.from}" -> "${f.to}"`));
if (APPLY) for (const f of subjFixes) await req("PATCH", `cns_subjects?id=eq.${f.id}`, { name: f.to });

// ------------------------------------------ 3. rebuild unit/topic by (code,name)
const unitNames = new Map(), topicNames = new Map();
for (const r of src) {
  if (r.unit_code) { if (!unitNames.has(r.unit_code)) unitNames.set(r.unit_code, new Set()); unitNames.get(r.unit_code).add(norm(r.unit_name)); }
  if (r.topic_code) { if (!topicNames.has(r.topic_code)) topicNames.set(r.topic_code, new Set()); topicNames.get(r.topic_code).add(norm(r.topic_name)); }
}
/** Codes with one name keep their original slug; collided codes get a name suffix. */
const unitSlug = (code, name) => "u-" + slugify(code) + (unitNames.get(code)?.size > 1 ? "-" + slugify(name).slice(0, 40) : "");
const topicSlug = (code, name) => "t-" + slugify(code) + (topicNames.get(code)?.size > 1 ? "-" + slugify(name).slice(0, 40) : "");

const bySlug = new Map();
for (const t of topics) bySlug.set(`${t.subject_id}|${t.slug}`, t);

let created = 0, renamed = 0, repointed = 0;
const wantTopicFor = new Map();

for (const r of linked) {
  const { subject_id: sid, src: s } = r;
  if (!sid) continue;

  let unitNode = null;
  if (s.unit_code && norm(s.unit_name)) {
    const sl = unitSlug(s.unit_code, norm(s.unit_name));
    const key = `${sid}|${sl}`;
    unitNode = bySlug.get(key) ?? null;
    if (!unitNode) {
      if (APPLY) {
        const [row] = await req("POST", "cns_topics", { subject_id: sid, slug: sl, name: norm(s.unit_name), parent_id: null, is_published: true });
        unitNode = row;
      } else unitNode = { id: `NEW:${key}`, name: norm(s.unit_name), slug: sl, subject_id: sid };
      bySlug.set(key, unitNode); created++;
    } else if (norm(unitNode.name) !== norm(s.unit_name)) {
      if (APPLY) await req("PATCH", `cns_topics?id=eq.${unitNode.id}`, { name: norm(s.unit_name) });
      unitNode.name = norm(s.unit_name); renamed++;
    }
  }

  let leaf = unitNode;
  if (s.topic_code && norm(s.topic_name)) {
    const sl = topicSlug(s.topic_code, norm(s.topic_name));
    const key = `${sid}|${sl}`;
    let node = bySlug.get(key) ?? null;
    if (!node) {
      if (APPLY) {
        const [row] = await req("POST", "cns_topics", { subject_id: sid, slug: sl, name: norm(s.topic_name), parent_id: unitNode?.id ?? null, is_published: true });
        node = row;
      } else node = { id: `NEW:${key}`, name: norm(s.topic_name), slug: sl, subject_id: sid };
      bySlug.set(key, node); created++;
    } else if (norm(node.name) !== norm(s.topic_name)) {
      if (APPLY) await req("PATCH", `cns_topics?id=eq.${node.id}`, { name: norm(s.topic_name) });
      node.name = norm(s.topic_name); renamed++;
    }
    leaf = node;
  }

  if (leaf && r.topic_id !== leaf.id) {
    wantTopicFor.set(r.id, { kind: r.kind, to: leaf.id });
    repointed++;
  }
}

say(`\n[3] topic tree — created ${created}, renamed ${renamed}, questions re-pointed ${repointed}`);
if (APPLY) {
  let i = 0;
  for (const [qid, v] of wantTopicFor) {
    const table = v.kind === "study" ? "cns_study_questions" : "cns_questions";
    await req("PATCH", `${table}?id=eq.${qid}`, { topic_id: v.to });
    if (++i % 250 === 0) say(`    re-pointed ${i}/${wantTopicFor.size}`);
  }
  say(`    re-pointed ${wantTopicFor.size} questions`);

  // Drop nodes left holding nothing.
  topics = await all(`${T}/rest/v1/cns_topics?select=id,slug,name,subject_id,parent_id`, th);
  const st = await all(`${T}/rest/v1/cns_study_questions?select=topic_id&institution_id=eq.${iid}&status=eq.published`, th);
  const mq = await all(`${T}/rest/v1/cns_questions?select=topic_id&institution_id=eq.${iid}`, th);
  const used = new Set([...st, ...mq].map((r) => r.topic_id).filter(Boolean));
  const hasChild = new Set(topics.map((t) => t.parent_id).filter(Boolean));
  const orphans = topics.filter((t) => !used.has(t.id) && !hasChild.has(t.id));
  for (const o of orphans) await req("DELETE", `cns_topics?id=eq.${o.id}`);
  say(`    removed ${orphans.length} now-empty topic nodes`);
}

say(APPLY ? "\nAPPLIED." : "\nDRY RUN — pass --apply to write.");

/**
 * Import the source bank's MCQs into cns_study_questions (the browse bank).
 *
 * The legacy site lists every question type in ONE flat list, MCQs included,
 * with options and answer behind "Show Answer". CNS keeps MCQs in
 * cns_questions for timed grading, with the answer key revoked from
 * `authenticated` — correct for grading, unusable for browsing.
 *
 * So the browse copy lands here instead. cns_questions is left exactly as is:
 * practice sets, attempts and grading keep working off it. After this runs the
 * browse bank is a single-table read totalling 8,929, matching the source.
 *
 * Requires migration cns_study_questions_mcq_options.sql first.
 * Idempotent by (source_ref, source_question_type='MCQ').
 *
 *   node scripts/import-rguhs-mcq-browse.mjs           # dry run
 *   node scripts/import-rguhs-mcq-browse.mjs --apply
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
    if (!Array.isArray(d)) { console.error("ERR", JSON.stringify(d).slice(0, 250)); break; }
    out = out.concat(d);
    if (d.length < 1000) break;
    from += 1000;
  }
  return out;
}

// Full source, so the (code, name) collision rules match the repair script.
const src = await all(`${S}?select=id,semester_number,subject_code,subject_name,unit_code,unit_name,topic_code,topic_name,question_type,marks,category,question,answer,rationale,exam_tip,option_a,option_b,option_c,option_d,correct_option,diagram_note&order=id.asc`, sh);

const unitNames = new Map(), topicNames = new Map();
for (const r of src) {
  if (r.unit_code) { if (!unitNames.has(r.unit_code)) unitNames.set(r.unit_code, new Set()); unitNames.get(r.unit_code).add(norm(r.unit_name)); }
  if (r.topic_code) { if (!topicNames.has(r.topic_code)) topicNames.set(r.topic_code, new Set()); topicNames.get(r.topic_code).add(norm(r.topic_name)); }
}
const unitSlug = (c, n) => "u-" + slugify(c) + (unitNames.get(c)?.size > 1 ? "-" + slugify(n).slice(0, 40) : "");
const topicSlug = (c, n) => "t-" + slugify(c) + (topicNames.get(c)?.size > 1 ? "-" + slugify(n).slice(0, 40) : "");

const inst = await (await fetch(`${T}/rest/v1/cns_institutions?select=id&slug=eq.rguhs`, { headers: th })).json();
const iid = inst[0].id;
const subjects = await all(`${T}/rest/v1/cns_subjects?select=id,slug,name,semester&institution_id=eq.${iid}`, th);
const topics = await all(`${T}/rest/v1/cns_topics?select=id,slug,subject_id`, th);

const subjBySlug = new Map(subjects.map((s) => [s.slug, s]));
// Resolving by code slug alone breaks after scripts/merge-duplicate-subjects.mjs:
// SEM1_ANAT's row was folded into SEM1_ANP's, so `sem1-anat` no longer exists.
// (semester, name) survives that merge, since a merge is precisely the case
// where two codes shared one name in one semester.
const subjByName = new Map(subjects.map((s) => [`${s.semester}|${norm(s.name)}`, s]));
const topicBySlug = new Map(topics.map((t) => [`${t.subject_id}|${t.slug}`, t]));

// Existing browse rows, so a re-run inserts nothing.
const existing = new Set(
  (await all(`${T}/rest/v1/cns_study_questions?select=source_ref&institution_id=eq.${iid}&source_question_type=eq.MCQ`, th))
    .map((r) => String(r.source_ref))
);

const mcqs = src.filter((r) => norm(r.question_type) === "MCQ");
say(`source MCQs: ${mcqs.length}   already in browse bank: ${existing.size}`);

const rows = [];
const unresolved = [];
for (const r of mcqs) {
  if (existing.has(String(r.id))) continue;

  const subject =
    subjByName.get(`${r.semester_number}|${norm(r.subject_name)}`) ??
    subjBySlug.get(slugify(r.subject_code));
  if (!subject) { unresolved.push({ id: r.id, why: "subject", code: r.subject_code }); continue; }

  let topicId = null;
  if (r.unit_code && norm(r.unit_name)) {
    topicId = topicBySlug.get(`${subject.id}|${unitSlug(r.unit_code, norm(r.unit_name))}`)?.id ?? null;
  }
  if (r.topic_code && norm(r.topic_name)) {
    const leaf = topicBySlug.get(`${subject.id}|${topicSlug(r.topic_code, norm(r.topic_name))}`);
    if (leaf) topicId = leaf.id;
  }
  if (!topicId) { unresolved.push({ id: r.id, why: "topic", code: r.topic_code }); continue; }

  rows.push({
    institution_id: iid,
    subject_id: subject.id,
    topic_id: topicId,
    source_question_type: "MCQ",
    stem: r.question,
    model_answer: r.answer,
    rationale: r.rationale || null,
    exam_tip: r.exam_tip || null,
    diagram_note: r.diagram_note || null,
    marks: r.marks ?? 1,
    category: r.category || null,
    option_a: r.option_a || null,
    option_b: r.option_b || null,
    option_c: r.option_c || null,
    option_d: r.option_d || null,
    correct_option: r.correct_option || null,
    tags: ["rguhs"],
    status: "published",
    source_ref: String(r.id),
  });
}

say(`to insert: ${rows.length}   unresolved: ${unresolved.length}`);
if (unresolved.length) say("  " + JSON.stringify(unresolved.slice(0, 5)));

if (APPLY && rows.length) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const r = await fetch(`${T}/rest/v1/cns_study_questions`, {
      method: "POST", headers: { ...th, Prefer: "return=minimal" }, body: JSON.stringify(chunk),
    });
    if (!r.ok) { console.error("insert failed:", r.status, (await r.text()).slice(0, 300)); process.exit(1); }
    say(`  inserted ${Math.min(i + 200, rows.length)}/${rows.length}`);
  }
}

say(APPLY ? "\nAPPLIED." : "\nDRY RUN — pass --apply to write.");

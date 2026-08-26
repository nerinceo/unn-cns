/**
 * Per-question parity check: every source question, every field, compared
 * against its CNS browse row.
 *
 * The browse bank is cns_study_questions, joined to source on source_ref = the
 * source row id. Checks are exact after whitespace normalisation only — the
 * curated text itself (stem, answer, rationale, exam tip, options) must match
 * character for character, and placement (semester, subject, unit, topic) must
 * match the labels the curator gave that row.
 *
 * Exits non-zero if anything is off, so it can gate a deploy.
 *
 *   node scripts/verify-rguhs-parity.mjs
 *   node scripts/verify-rguhs-parity.mjs --list     # print every mismatch
 */
import fs from "node:fs";

const LIST = process.argv.includes("--list");

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const T = env.NEXT_PUBLIC_SUPABASE_URL;
const th = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY };

const SK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmYnFnbWljZG10aGhxb3Jsd2liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMTA3MjEsImV4cCI6MjA5NjY4NjcyMX0.Ln8wpOVvlEHACqzTurMDrCEzDhePilSn6FW8D8Hs0WA";
const S = "https://pfbqgmicdmthhqorlwib.supabase.co/rest/v1/qb_public_questions";
const sh = { apikey: SK, Authorization: "Bearer " + SK };

async function all(url, headers) {
  let out = [], from = 0;
  for (;;) {
    const sep = url.includes("?") ? "&" : "?";
    for (let attempt = 0; ; attempt++) {
      try {
        const d = await (await fetch(`${url}${sep}offset=${from}&limit=1000`, { headers })).json();
        if (!Array.isArray(d)) throw new Error(JSON.stringify(d).slice(0, 200));
        out = out.concat(d);
        if (d.length < 1000) return out;
        from += 1000;
        break;
      } catch (e) {
        if (attempt >= 3) throw e;      // transient ECONNRESET against the source
      }
    }
  }
}

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

const src = await all(
  `${S}?select=id,semester_number,subject_name,unit_name,topic_name,question_type,marks,question,answer,rationale,exam_tip,option_a,option_b,option_c,option_d,correct_option&order=id.asc`,
  sh
);

const inst = await (await fetch(`${T}/rest/v1/cns_institutions?select=id&slug=eq.rguhs`, { headers: th })).json();
const iid = inst[0].id;
const subjects = await all(`${T}/rest/v1/cns_subjects?select=id,name,semester&institution_id=eq.${iid}`, th);
const topics = await all(`${T}/rest/v1/cns_topics?select=id,name,parent_id,subject_id`, th);
const rows = await all(
  `${T}/rest/v1/cns_study_questions?select=id,source_ref,stem,model_answer,rationale,exam_tip,source_question_type,marks,subject_id,topic_id,option_a,option_b,option_c,option_d,correct_option&institution_id=eq.${iid}&status=eq.published`,
  th
);

const subj = new Map(subjects.map((s) => [s.id, s]));
const topic = new Map(topics.map((t) => [t.id, t]));
const cns = new Map(rows.filter((r) => r.source_ref).map((r) => [String(r.source_ref), r]));

/** Every field checked per question. Subject synonyms are a known, accepted call. */
const SYNONYM_OK = new Set([
  "Microbiology|Applied Microbiology and Infection Control including Safety",
  "OBG Nursing I|Midwifery and Obstetrical Nursing I",
  "Midwifery and Obstetrical Nursing II|OBG Nursing II",
]);

const fail = new Map();
const bump = (k, detail) => {
  if (!fail.has(k)) fail.set(k, []);
  fail.get(k).push(detail);
};

let checked = 0, synonyms = 0;
for (const s of src) {
  const c = cns.get(String(s.id));
  if (!c) { bump("missing", { id: s.id }); continue; }
  checked++;

  const cs = subj.get(c.subject_id);
  const t = c.topic_id ? topic.get(c.topic_id) : null;
  const unit = t?.parent_id ? topic.get(t.parent_id) : null;

  // Placement
  if (!cs) bump("subject-row", { id: s.id });
  else {
    if (cs.semester !== s.semester_number) bump("semester", { id: s.id, want: s.semester_number, got: cs.semester });
    if (norm(cs.name) !== norm(s.subject_name)) {
      if (SYNONYM_OK.has(`${norm(s.subject_name)}|${norm(cs.name)}`)) synonyms++;
      else bump("subject", { id: s.id, want: s.subject_name, got: cs.name });
    }
  }
  if (norm(s.topic_name) && norm(t?.name) !== norm(s.topic_name)) bump("topic", { id: s.id, want: s.topic_name, got: t?.name ?? null });
  if (norm(s.unit_name) && norm(unit?.name ?? t?.name) !== norm(s.unit_name)) bump("unit", { id: s.id, want: s.unit_name, got: unit?.name ?? t?.name ?? null });

  // Curated content — the part that must never drift
  if (norm(c.stem) !== norm(s.question)) bump("stem", { id: s.id });
  if (norm(c.model_answer) !== norm(s.answer)) bump("answer", { id: s.id });
  if (norm(c.rationale) !== norm(s.rationale)) bump("rationale", { id: s.id });
  if (norm(c.exam_tip) !== norm(s.exam_tip)) bump("exam_tip", { id: s.id });
  if (norm(c.source_question_type) !== norm(s.question_type)) bump("type", { id: s.id, want: s.question_type, got: c.source_question_type });
  if (num(c.marks) !== num(s.marks)) bump("marks", { id: s.id, want: s.marks, got: c.marks });

  for (const k of ["option_a", "option_b", "option_c", "option_d", "correct_option"]) {
    if (norm(c[k]) !== norm(s[k])) bump(k, { id: s.id, want: s[k], got: c[k] });
  }
}

const orphans = [...cns.keys()].filter((k) => !src.some((s) => String(s.id) === k));

console.log("=".repeat(60));
console.log(`source questions   : ${src.length}`);
console.log(`checked in CNS     : ${checked}`);
console.log(`CNS w/o source row : ${orphans.length}`);
console.log(`accepted synonyms  : ${synonyms}  (3 subject codes the source names two ways)`);
console.log("=".repeat(60));

const FIELDS = ["missing", "subject-row", "semester", "subject", "unit", "topic", "stem", "answer",
  "rationale", "exam_tip", "type", "marks", "option_a", "option_b", "option_c", "option_d", "correct_option"];
let bad = 0;
for (const f of FIELDS) {
  const n = fail.get(f)?.length ?? 0;
  bad += n;
  console.log(`${n === 0 ? "OK  " : "FAIL"} ${f.padEnd(14)} ${n}`);
}
console.log("=".repeat(60));

if (LIST) for (const [k, v] of fail) { console.log(`\n--- ${k} (${v.length}) ---`); v.slice(0, 40).forEach((x) => console.log("   ", JSON.stringify(x))); }

console.log(bad === 0 && orphans.length === 0 ? "\nEXACT — every question matches on every field." : `\n${bad} field mismatches across ${new Set([...fail.values()].flat().map((x) => x.id)).size} questions.`);
process.exit(bad === 0 && orphans.length === 0 ? 0 : 1);

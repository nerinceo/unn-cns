/**
 * Merge subjects that are one subject wearing two source codes.
 *
 * The source bank gives some subjects two subject_codes carrying the SAME
 * subject_name — SEM1_ANP / SEM1_ANAT are both "Applied Anatomy and
 * Physiology". The importer keyed on code, so each pair became two CNS subject
 * rows, and once their names were corrected to match the source they showed up
 * as duplicate chips in the subject filter: two "Applied Anatomy and
 * Physiology" entries, one with 30 questions and one with 381.
 *
 * This folds the smaller row into the larger one: topics are re-created under
 * the winner where missing (parents before children, so the tree survives),
 * every question and question set is re-pointed, then the empty loser is
 * dropped. Question content is never touched — only which subject row it hangs
 * from.
 *
 *   node scripts/merge-duplicate-subjects.mjs           # dry run
 *   node scripts/merge-duplicate-subjects.mjs --apply
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
const say = (...a) => console.log(...a);

async function all(path) {
  let out = [], from = 0;
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const d = await (await fetch(`${T}/rest/v1/${path}${sep}offset=${from}&limit=1000`, { headers: th })).json();
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

const inst = await (await fetch(`${T}/rest/v1/cns_institutions?select=id&slug=eq.rguhs`, { headers: th })).json();
const iid = inst[0].id;

const subjects = await all(`cns_subjects?select=id,slug,name,semester&institution_id=eq.${iid}`);
const topics = await all(`cns_topics?select=id,slug,name,subject_id,parent_id`);
const study = await all(`cns_study_questions?select=id,subject_id,topic_id&institution_id=eq.${iid}`);
const mcq = await all(`cns_questions?select=id,subject_id,topic_id&institution_id=eq.${iid}`);
const sets = await all(`cns_question_sets?select=id,subject_id&institution_id=eq.${iid}`);

const qCount = new Map();
for (const r of [...study, ...mcq]) qCount.set(r.subject_id, (qCount.get(r.subject_id) ?? 0) + 1);

// Group by (semester, name) — the pair is only a duplicate if it is the same
// subject in the same semester. "Community Health Nursing I" exists in both
// Sem 5 and Sem 6 and those are genuinely different subjects.
const groups = new Map();
for (const s of subjects) {
  const k = `${s.semester}|${String(s.name).trim()}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(s);
}
const dups = [...groups.values()].filter((v) => v.length > 1);
say(`duplicate subject groups: ${dups.length}\n`);

for (const group of dups) {
  const sorted = [...group].sort((a, b) => (qCount.get(b.id) ?? 0) - (qCount.get(a.id) ?? 0));
  const winner = sorted[0];
  const losers = sorted.slice(1);

  say(`Sem${winner.semester} "${winner.name}"`);
  say(`   keep  ${winner.slug} (${qCount.get(winner.id) ?? 0})`);
  for (const l of losers) say(`   merge ${l.slug} (${qCount.get(l.id) ?? 0}) -> ${winner.slug}`);

  for (const loser of losers) {
    const winnerTopics = new Map(topics.filter((t) => t.subject_id === winner.id).map((t) => [t.slug, t]));
    const loserTopics = topics.filter((t) => t.subject_id === loser.id);
    const map = new Map(); // loser topic id -> winner topic id

    // Parents before children, so a child's parent_id already exists.
    const ordered = [...loserTopics.filter((t) => !t.parent_id), ...loserTopics.filter((t) => t.parent_id)];
    for (const t of ordered) {
      const hit = winnerTopics.get(t.slug);
      if (hit) { map.set(t.id, hit.id); continue; }
      if (APPLY) {
        const [row] = await req("POST", "cns_topics", {
          subject_id: winner.id,
          slug: t.slug,
          name: t.name,
          parent_id: t.parent_id ? map.get(t.parent_id) ?? null : null,
          is_published: true,
        });
        winnerTopics.set(t.slug, row);
        map.set(t.id, row.id);
      } else {
        map.set(t.id, `NEW:${t.slug}`);
      }
    }

    const movedStudy = study.filter((q) => q.subject_id === loser.id);
    const movedMcq = mcq.filter((q) => q.subject_id === loser.id);
    const movedSets = sets.filter((s) => s.subject_id === loser.id);
    say(`      topics ${loserTopics.length} (reused ${loserTopics.length - [...map.values()].filter((v) => String(v).startsWith("NEW:")).length}), study ${movedStudy.length}, mcq ${movedMcq.length}, sets ${movedSets.length}`);

    if (APPLY) {
      for (const q of movedStudy) {
        await req("PATCH", `cns_study_questions?id=eq.${q.id}`, {
          subject_id: winner.id,
          topic_id: q.topic_id ? map.get(q.topic_id) ?? null : null,
        });
      }
      for (const q of movedMcq) {
        await req("PATCH", `cns_questions?id=eq.${q.id}`, {
          subject_id: winner.id,
          topic_id: q.topic_id ? map.get(q.topic_id) ?? null : null,
        });
      }
      for (const s of movedSets) await req("PATCH", `cns_question_sets?id=eq.${s.id}`, { subject_id: winner.id });
      for (const t of loserTopics) await req("DELETE", `cns_topics?id=eq.${t.id}`);
      await req("DELETE", `cns_subjects?id=eq.${loser.id}`);
      say(`      merged and removed ${loser.slug}`);
    }
  }
  say("");
}

say(APPLY ? "APPLIED." : "DRY RUN — pass --apply to write.");

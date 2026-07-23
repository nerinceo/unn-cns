/**
 * Import RGUHS B.Sc Nursing questions from the source Supabase into CNS.
 *
 * Two content kinds share one subject/topic hierarchy:
 *   - MCQ (question_type='MCQ')  -> cns_questions + cns_question_options  (auto-graded)
 *   - everything else            -> cns_study_questions                   (model-answer revision)
 *
 * Idempotent: every imported row carries source_ref = the source row id, and we
 * pre-fetch existing source_refs rather than relying on the partial unique index
 * (which PostgREST upsert cannot target). Re-running inserts only what is missing.
 *
 * Usage:
 *   node scripts/import-rguhs.mjs mcq     # phase 1: MCQs -> question bank + sets
 *   node scripts/import-rguhs.mjs study   # phase 2: open-ended -> revision bank
 *   node scripts/import-rguhs.mjs both
 *
 * Source creds are read from .tmp-source.env (gitignored) or SOURCE_* env vars.
 * Target creds from .env. Neither key is ever logged.
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const phase = process.argv[2] ?? "mcq";
const readEnv = (path) =>
  Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"(.*)"$/, "$1")])
  );

const tenv = readEnv(".env");
let senv = {};
try { senv = readEnv(".tmp-source.env"); } catch { senv = process.env; }

const target = createClient(tenv.NEXT_PUBLIC_SUPABASE_URL, tenv.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const source = createClient(senv.SOURCE_SUPABASE_URL, senv.SOURCE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const slugify = (s) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "x";

// ---------------------------------------------------------------------------
// Read every source row (paged), selecting only what we need.
// ---------------------------------------------------------------------------
async function fetchAll(select, filter) {
  const out = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    let q = source.from("qb_questions").select(select).range(from, from + page - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error("source read: " + error.message);
    if (!data.length) break;
    out.push(...data);
    from += page;
    if (data.length < page) break;
  }
  return out;
}

/** Page through a target table — PostgREST caps a single read at 1000 rows, so
 *  any "load everything already imported" query MUST paginate or dedup silently
 *  misses rows past the first 1000. */
async function fetchAllTarget(table, select, applyFilters) {
  const out = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    let q = target.from(table).select(select).range(from, from + page - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table} read: ` + error.message);
    if (!data.length) break;
    out.push(...data);
    from += page;
    if (data.length < page) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hierarchy resolver — ensures institution -> subject -> unit -> topic exist,
// caching ids so each subject/topic is created once. Shared by both phases.
// ---------------------------------------------------------------------------
const subjectCache = new Map(); // subject_code -> subject_id
const topicCache = new Map();   // cache key -> topic_id
let RGUHS = null;

async function institutionId() {
  if (RGUHS) return RGUHS;
  const { data } = await target.from("cns_institutions").select("id").eq("slug", "rguhs").maybeSingle();
  if (data) return (RGUHS = data.id);
  const { data: ins, error } = await target
    .from("cns_institutions")
    .insert({ slug: "rguhs", name: "Rajiv Gandhi University of Health Sciences", short_name: "RGUHS", country: "IN", institution_type: "university" })
    .select("id")
    .single();
  if (error) throw error;
  return (RGUHS = ins.id);
}

async function ensureSubject(row) {
  const code = row.subject_code || slugify(row.subject_name);
  const slug = slugify(code); // cache key == slug, so prewarm (keyed by slug) matches
  if (subjectCache.has(slug)) return subjectCache.get(slug);
  const inst = await institutionId();
  const { data: found } = await target
    .from("cns_subjects")
    .select("id")
    .eq("institution_id", inst)
    .eq("slug", slug)
    .maybeSingle();
  let id = found?.id;
  if (!id) {
    const { data, error } = await target
      .from("cns_subjects")
      .insert({ institution_id: inst, slug, name: row.subject_name || code, year_of_study: row.year_number ?? null, semester: row.semester_number ?? null, is_published: true })
      .select("id")
      .single();
    if (error) throw new Error("subject " + code + ": " + error.message);
    id = data.id;
  }
  subjectCache.set(slug, id);
  return id;
}

async function ensureTopic(subjectId, slug, name, parentId) {
  const key = subjectId + "|" + (parentId ?? "") + "|" + slug;
  if (topicCache.has(key)) return topicCache.get(key);
  const sel = target.from("cns_topics").select("id").eq("subject_id", subjectId).eq("slug", slug);
  const { data: found } = await (parentId ? sel.eq("parent_id", parentId) : sel.is("parent_id", null)).maybeSingle();
  let id = found?.id;
  if (!id) {
    const { data, error } = await target
      .from("cns_topics")
      .insert({ subject_id: subjectId, slug, name: name || slug, parent_id: parentId ?? null })
      .select("id")
      .single();
    if (error) throw new Error("topic " + slug + ": " + error.message);
    id = data.id;
  }
  topicCache.set(key, id);
  return id;
}

/**
 * Load every existing subject and topic into the caches up front, so the
 * per-row resolver hits the database only to CREATE genuinely new rows, never
 * to look one up. Cheap (two paged reads) and turns 7,690 sequential lookups
 * into in-memory Map hits.
 */
async function prewarmCaches() {
  const inst = await institutionId();
  const { data: subs } = await target.from("cns_subjects").select("id,slug").eq("institution_id", inst);
  for (const s of subs ?? []) subjectCache.set(s.slug, s.id); // keyed by slug (== slugified code)
  // Topics can exceed a single page; read them all.
  let from = 0;
  for (;;) {
    const { data } = await target.from("cns_topics").select("id,subject_id,slug,parent_id").range(from, from + 1000 - 1);
    if (!data || !data.length) break;
    for (const t of data) topicCache.set(t.subject_id + "|" + (t.parent_id ?? "") + "|" + t.slug, t.id);
    if (data.length < 1000) break;
    from += 1000;
  }
}

/** Returns { subjectId, topicId } — topicId is the most specific level present. */
async function resolveHierarchy(row) {
  const subjectId = await ensureSubject(row);
  let unitTopicId = null;
  if (row.unit_code) {
    unitTopicId = await ensureTopic(subjectId, "u-" + slugify(row.unit_code), row.unit_name, null);
  }
  let leafTopicId = null;
  if (row.topic_code) {
    leafTopicId = await ensureTopic(subjectId, "t-" + slugify(row.topic_code), row.topic_name, unitTopicId);
  }
  return { subjectId, topicId: leafTopicId ?? unitTopicId };
}

async function startBatch(source_detail, row_count) {
  const { data } = await target
    .from("cns_import_batches")
    .insert({ institution_id: await institutionId(), source: "rguhs-source-supabase", source_detail, row_count, status: "running" })
    .select("id")
    .single();
  return data?.id ?? null;
}
async function finishBatch(id, counts) {
  if (!id) return;
  await target.from("cns_import_batches").update({ ...counts, status: "completed", completed_at: new Date().toISOString() }).eq("id", id);
}

const HIER = "id,university,course,year_number,semester_number,subject_code,subject_name,unit_code,unit_name,topic_code,topic_name";
const OPT_POS = { A: 0, B: 1, C: 2, D: 3 };

// ---------------------------------------------------------------------------
// Phase 1 — MCQs -> cns_questions + cns_question_options, one practice set/subject
// ---------------------------------------------------------------------------
async function importMcq() {
  const inst = await institutionId();
  const rows = await fetchAll(HIER + ",question,answer,option_a,option_b,option_c,option_d,correct_option,rationale,marks,category", (q) => q.eq("question_type", "MCQ"));
  console.log(`MCQ source rows: ${rows.length}`);

  // source_ref is stored as TEXT; row.id is a number. Compare as strings, and
  // paginate — an unpaginated read stops at 1000 and dedup silently breaks.
  const existing = await fetchAllTarget("cns_questions", "source_ref", (q) => q.eq("institution_id", inst).contains("tags", ["rguhs"]));
  const seen = new Set(existing.map((r) => String(r.source_ref)));
  console.log(`already imported: ${seen.size}`);

  const batch = await startBatch("MCQ -> question bank", rows.length);
  let inserted = 0, skipped = 0, errors = 0;
  const errorLog = [];

  // Pass 1 — questions + options. Idempotent by source_ref.
  for (const row of rows) {
    if (seen.has(String(row.id))) { skipped++; continue; }
    try {
      const { subjectId, topicId } = await resolveHierarchy(row);
      const { data: q, error: qe } = await target.from("cns_questions").insert({
        institution_id: inst, subject_id: subjectId, topic_id: topicId,
        question_type: "mcq_single", stem: row.question,
        explanation: row.rationale || row.answer || null,
        difficulty: "medium", marks: row.marks ?? 1, negative_marks: 0,
        tags: [row.category, "rguhs"].filter(Boolean),
        status: "published", source_ref: row.id, import_batch_id: batch,
      }).select("id").single();
      if (qe) throw qe;

      const opts = [row.option_a, row.option_b, row.option_c, row.option_d];
      const correct = String(row.correct_option || "").trim().toUpperCase();
      const optRows = opts
        .map((text, i) => ({ question_id: q.id, position: i, option_text: text ?? "", is_correct: OPT_POS[correct] === i }))
        .filter((o) => o.option_text.trim() !== "");
      const { error: oe } = await target.from("cns_question_options").insert(optRows);
      if (oe) throw oe;

      inserted++;
      if (inserted % 200 === 0) console.log(`  inserted ${inserted}...`);
    } catch (e) {
      errors++;
      if (errorLog.length < 50) errorLog.push({ id: row.id, error: String(e.message ?? e).slice(0, 160) });
    }
  }

  // Pass 2 — one practice set per subject, self-healing. Re-reads every imported
  // question so a set assignment missed on an earlier run is repaired now.
  const mine = await fetchAllTarget("cns_questions", "id,subject_id",
    (q) => q.eq("institution_id", inst).eq("question_type", "mcq_single").contains("tags", ["rguhs"]));
  const bySubject = new Map();
  for (const q of mine) {
    if (!bySubject.has(q.subject_id)) bySubject.set(q.subject_id, []);
    bySubject.get(q.subject_id).push(q.id);
  }

  let setsMade = 0, itemsAdded = 0;
  for (const [subjectId, qids] of bySubject) {
    const { data: subj } = await target.from("cns_subjects").select("name").eq("id", subjectId).maybeSingle();
    const slug = "rguhs-practice-" + subjectId.slice(0, 8);
    let { data: set } = await target.from("cns_question_sets").select("id").eq("slug", slug).maybeSingle();
    if (!set) {
      const { data: ns, error: se } = await target.from("cns_question_sets").insert({
        institution_id: inst, subject_id: subjectId, slug,
        title: (subj?.name ?? "RGUHS") + " — Practice MCQs", set_type: "practice",
        access_type: "free", show_answers_mode: "after_submit", is_published: true,
      }).select("id").single();
      if (se) { errorLog.push({ set: slug, error: se.message }); continue; }
      set = ns; setsMade++;
    }
    const { data: have } = await target.from("cns_question_set_items").select("question_id").eq("set_id", set.id);
    const haveSet = new Set((have ?? []).map((h) => h.question_id));
    const toAdd = qids.filter((id) => !haveSet.has(id)).map((id, i) => ({ set_id: set.id, question_id: id, position: haveSet.size + i }));
    for (let i = 0; i < toAdd.length; i += 500) {
      const { error } = await target.from("cns_question_set_items").insert(toAdd.slice(i, i + 500));
      if (!error) itemsAdded += Math.min(500, toAdd.length - i);
    }
  }

  await finishBatch(batch, { inserted_count: inserted, updated_count: 0, error_count: errors, errors: errorLog });
  console.log(`\nMCQ done: inserted ${inserted}, skipped ${skipped}, errors ${errors}`);
  if (errorLog.length) console.log("first errors:", JSON.stringify(errorLog.slice(0, 5), null, 2));
  console.log(`practice sets: ${bySubject.size} subjects (${setsMade} new), items added ${itemsAdded}`);
}

// ---------------------------------------------------------------------------
// Phase 2 — open-ended questions -> cns_study_questions (batched, resumable)
// ---------------------------------------------------------------------------
async function importStudy() {
  const inst = await institutionId();
  await prewarmCaches();
  const rows = await fetchAll(HIER + ",question_type,question,answer,rationale,exam_tip,marks,category", (q) => q.neq("question_type", "MCQ"));
  console.log(`open-ended source rows: ${rows.length}`);

  const existing = await fetchAllTarget("cns_study_questions", "source_ref", (q) => q.eq("institution_id", inst).not("source_ref", "is", null));
  const seen = new Set(existing.map((r) => String(r.source_ref)));
  console.log(`already imported: ${seen.size}`);

  const batch = await startBatch("open-ended -> revision bank", rows.length);
  let prepared = 0, skipped = 0, errors = 0, inserted = 0;
  const errorLog = [];
  const pending = [];

  const flush = async () => {
    if (!pending.length) return;
    const chunk = pending.splice(0, pending.length);
    const { error } = await target.from("cns_study_questions").insert(chunk);
    if (error) { errors += chunk.length; if (errorLog.length < 50) errorLog.push({ error: error.message.slice(0, 160) }); }
    else inserted += chunk.length;
  };

  for (const row of rows) {
    if (seen.has(String(row.id))) { skipped++; continue; }
    try {
      const { subjectId, topicId } = await resolveHierarchy(row);
      pending.push({
        institution_id: inst, subject_id: subjectId, topic_id: topicId,
        source_question_type: row.question_type, stem: row.question,
        model_answer: row.answer ?? null, rationale: row.rationale ?? null, exam_tip: row.exam_tip ?? null,
        marks: row.marks ?? null, category: row.category ?? null,
        tags: [row.category, "rguhs"].filter(Boolean),
        status: "published", source_ref: row.id, import_batch_id: batch,
      });
      prepared++;
      if (pending.length >= 500) { await flush(); console.log(`  inserted ${inserted}...`); }
    } catch (e) {
      errors++;
      if (errorLog.length < 50) errorLog.push({ id: row.id, error: String(e.message ?? e).slice(0, 160) });
    }
  }
  await flush();

  await finishBatch(batch, { inserted_count: inserted, updated_count: 0, error_count: errors, errors: errorLog });
  console.log(`\nStudy done: prepared ${prepared}, inserted ${inserted}, skipped ${skipped}, errors ${errors}`);
  if (errorLog.length) console.log("first errors:", JSON.stringify(errorLog.slice(0, 5), null, 2));
}

// ---------------------------------------------------------------------------
if (phase === "mcq" || phase === "both") await importMcq();
if (phase === "study" || phase === "both") await importStudy();

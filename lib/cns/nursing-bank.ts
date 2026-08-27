import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reads for the Nursing Bank browse tree: university -> course -> semester ->
 * questions.
 *
 * This is the legacy unnhub.org/nursingbank hierarchy rebuilt on CNS tables.
 * The old site had one flat denormalised table with a `semester_number` column
 * on every row; here semester lives on `cns_subjects`, so every tally below is
 * a question -> subject -> semester roll-up.
 *
 * Both halves of the bank count toward a semester total: MCQs in
 * `cns_questions` and written questions in `cns_study_questions`. The old
 * site's per-semester numbers (1097, 1033, ...) were the sum of both, so
 * counting one table would under-report every card.
 */

/**
 * Read every matching row, not just the first 1000.
 *
 * PostgREST caps one response at 1000 rows. A tally over ~8,900 questions that
 * forgets this silently counts the first page only — which is exactly how the
 * old site's subject filter came to show 1000 of 1097 questions.
 */
async function selectAll(
  supabase: SupabaseClient,
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data } = await build(from, from + page - 1);
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return out;
}

export type SemesterSubject = {
  id: string;
  name: string;
  semester: number | null;
  descriptiveCount: number;
  mcqCount: number;
  total: number;
};

/**
 * Every subject for one institution with its semester and both question counts.
 *
 * This is the single roll-up the whole tree is built from — the semester cards,
 * the subject filter and the question list all derive from it, so the numbers
 * on each page cannot disagree with each other.
 */
export async function getBankRollup(institutionId: string): Promise<SemesterSubject[]> {
  const supabase = await createClient();

  // The browse bank is cns_study_questions. MCQs are being migrated into it
  // (scripts/import-rguhs-mcq-browse.mjs); until that has run they still live
  // only in cns_questions, so those are counted too — but only the ones with no
  // browse twin yet, keyed on source_ref. That keeps the totals right before,
  // during and after the migration, instead of dropping by 1,239 in between.
  const [subjects, rows, legacyMcq] = await Promise.all([
    supabase
      .from("cns_subjects")
      .select("id,name,semester,year_of_study")
      .eq("institution_id", institutionId)
      .order("name", { ascending: true }),
    selectAll(supabase, (from, to) =>
      supabase
        .from("cns_study_questions")
        .select("subject_id,source_question_type,source_ref")
        .eq("status", "published")
        .eq("institution_id", institutionId)
        .range(from, to)
    ),
    selectAll(supabase, (from, to) =>
      supabase
        .from("cns_questions")
        .select("subject_id,source_ref")
        .eq("institution_id", institutionId)
        .range(from, to)
    ),
  ]);

  const total = new Map<string, number>();
  const mcq = new Map<string, number>();
  const browsed = new Set<string>();
  for (const r of rows) {
    const k = r.subject_id as string;
    if (!k) continue;
    if (r.source_ref) browsed.add(String(r.source_ref));
    total.set(k, (total.get(k) ?? 0) + 1);
    if (r.source_question_type === "MCQ") mcq.set(k, (mcq.get(k) ?? 0) + 1);
  }
  for (const r of legacyMcq) {
    const k = r.subject_id as string;
    if (!k || (r.source_ref && browsed.has(String(r.source_ref)))) continue;
    total.set(k, (total.get(k) ?? 0) + 1);
    mcq.set(k, (mcq.get(k) ?? 0) + 1);
  }

  return (subjects.data ?? []).map((s) => {
    const id = s.id as string;
    const t = total.get(id) ?? 0;
    const m = mcq.get(id) ?? 0;
    return {
      id,
      name: s.name as string,
      semester: (s.semester as number) ?? null,
      descriptiveCount: t - m,
      mcqCount: m,
      total: t,
    };
  });
}

export type TopicLabel = { name: string; unitName: string | null };

/**
 * topic_id -> its own name and its unit's name, for the ` · ` meta chain.
 * The source renders subject · unit · topic · marks, and the unit is this
 * topic's parent in the tree the importer built.
 */
export async function getTopicIndex(subjectIds: string[]): Promise<Map<string, TopicLabel>> {
  const out = new Map<string, TopicLabel>();
  if (subjectIds.length === 0) return out;

  const supabase = await createClient();
  const rows = await selectAll(supabase, (from, to) =>
    supabase.from("cns_topics").select("id,name,parent_id,subject_id").in("subject_id", subjectIds).range(from, to)
  );

  const byId = new Map(rows.map((r) => [r.id as string, r]));
  for (const r of rows) {
    const parent = r.parent_id ? byId.get(r.parent_id as string) : null;
    out.set(r.id as string, {
      name: r.name as string,
      // A leaf's parent is its unit. A unit has no parent, so it IS the unit
      // and must not repeat itself in the chain.
      unitName: parent ? (parent.name as string) : null,
    });
  }
  return out;
}

/** Per-semester totals, keyed by semester number. Semesters with no content return 0. */
export function tallyBySemester(rollup: SemesterSubject[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of rollup) {
    if (s.semester == null) continue;
    out.set(s.semester, (out.get(s.semester) ?? 0) + s.total);
  }
  return out;
}

/** The subjects belonging to one semester, with counts, for the filter rail. */
export function subjectsInSemester(
  rollup: SemesterSubject[],
  semester: number
): SemesterSubject[] {
  return rollup
    .filter((s) => s.semester === semester && s.total > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type BankQuestion = {
  id: string;
  stem: string;
  model_answer: string | null;
  rationale: string | null;
  exam_tip: string | null;
  diagram_note: string | null;
  source_question_type: string | null;
  marks: number | null;
  subject_id: string;
  topic_id: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_option: string | null;
};

const QUESTION_COLS =
  "id,stem,model_answer,rationale,exam_tip,diagram_note,source_question_type,marks,subject_id,topic_id,option_a,option_b,option_c,option_d,correct_option";

const PAGE = 25;

/**
 * One semester's written questions, filtered and paged.
 *
 * Every question type is listed together, MCQs included — the source presents
 * one flat list and so does this. The MCQs read here are the browse copies in
 * cns_study_questions, never cns_questions, whose answer-key columns stay
 * revoked from `authenticated` for the graded practice-set flow.
 */
export async function getSemesterQuestions(opts: {
  institutionId: string;
  subjectIds: string[];
  subjectId?: string;
  type?: string;
  search?: string;
  page?: number;
}): Promise<{ questions: BankQuestion[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient();
  const page = Math.max(0, opts.page ?? 0);

  // Scope to the semester's subjects. An empty list would otherwise match the
  // whole institution, showing another semester's questions under this header.
  const scope = opts.subjectId ? [opts.subjectId] : opts.subjectIds;
  if (scope.length === 0) {
    return { questions: [], total: 0, page, pageSize: PAGE };
  }

  let query = supabase
    .from("cns_study_questions")
    .select(QUESTION_COLS, { count: "exact" })
    .eq("status", "published")
    .in("subject_id", scope);

  if (opts.type) query = query.eq("source_question_type", opts.type);
  if (opts.search) {
    const term = opts.search.replace(/[%,()]/g, " ").trim();
    if (term) query = query.or(`stem.ilike.%${term}%,model_answer.ilike.%${term}%`);
  }

  // Ordered by id, which is a v4 uuid — so the list interleaves types and
  // subjects instead of running all 389 Short Essays together before the first
  // MCQ. Random-looking but deterministic, which matters: ORDER BY random()
  // would reshuffle on every page fetch and let a question appear twice or not
  // at all as the reader pages through.
  const { data, count } = await query
    .order("id", { ascending: true })
    .range(page * PAGE, page * PAGE + PAGE - 1);

  return {
    questions: (data ?? []) as unknown as BankQuestion[],
    total: count ?? 0,
    page,
    pageSize: PAGE,
  };
}

/** One question for the full-page view. */
export async function getBankQuestion(id: string): Promise<BankQuestion | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_study_questions")
    .select(QUESTION_COLS)
    .eq("status", "published")
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as BankQuestion) ?? null;
}

/** Distinct question types across a semester, for the type filter. */
export async function getSemesterTypes(
  subjectIds: string[]
): Promise<{ type: string; count: number }[]> {
  if (subjectIds.length === 0) return [];
  const supabase = await createClient();
  const rows = await selectAll(supabase, (from, to) =>
    supabase
      .from("cns_study_questions")
      .select("source_question_type")
      .eq("status", "published")
      .in("subject_id", subjectIds)
      .range(from, to)
  );
  const counts = new Map<string, number>();
  for (const r of rows) {
    const t = (r.source_question_type as string) ?? "Other";
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => a.type.localeCompare(b.type));
}

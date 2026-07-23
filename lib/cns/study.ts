import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read every matching row, not just the first 1000.
 *
 * PostgREST caps a single response at 1000 rows. A tally over all ~7,690
 * revision questions that forgets this silently counts only the first page —
 * which is exactly how a browse tally can show 13 subjects instead of 73.
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

/**
 * Revision bank reads.
 *
 * The open-ended counterpart to the question bank: model-answer study
 * questions, browsed by subject and topic. Everything here is published content
 * a signed-in learner may read in full — there are no secret columns, unlike
 * cns_questions where the answer key is revoked.
 */

export type StudySubject = {
  id: string;
  name: string;
  year_of_study: number | null;
  semester: number | null;
  count: number;
};

/** Subjects that actually have published revision questions, with counts. */
export async function getStudySubjects(): Promise<StudySubject[]> {
  const supabase = await createClient();

  // One count query per subject would be dozens of round trips. Instead read
  // the (subject_id) of every published row once and tally in memory — the
  // column is tiny and this is a browse page, not a hot path. Paginated, or the
  // tally stops at 1000 rows and most subjects vanish.
  const [rows, { data: subjects }] = await Promise.all([
    selectAll(supabase, (from, to) =>
      supabase.from("cns_study_questions").select("subject_id").eq("status", "published").range(from, to)
    ),
    supabase.from("cns_subjects").select("id,name,year_of_study,semester"),
  ]);

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.subject_id as string, (counts.get(r.subject_id as string) ?? 0) + 1);

  return (subjects ?? [])
    .map((s) => ({
      id: s.id as string,
      name: s.name as string,
      year_of_study: (s.year_of_study as number) ?? null,
      semester: (s.semester as number) ?? null,
      count: counts.get(s.id as string) ?? 0,
    }))
    .filter((s) => s.count > 0)
    .sort((a, b) => (a.year_of_study ?? 99) - (b.year_of_study ?? 99) || a.name.localeCompare(b.name));
}

export type StudyQuestion = {
  id: string;
  stem: string;
  model_answer: string | null;
  rationale: string | null;
  exam_tip: string | null;
  source_question_type: string | null;
  marks: number | null;
  topic_id: string | null;
};

const PAGE = 25;

/**
 * One subject's revision questions, paged. Optional topic and type filters keep
 * a busy subject (100+ questions) navigable.
 */
export async function getStudyQuestions(opts: {
  subjectId: string;
  topicId?: string;
  type?: string;
  page?: number;
}): Promise<{ questions: StudyQuestion[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient();
  const page = Math.max(0, opts.page ?? 0);

  let query = supabase
    .from("cns_study_questions")
    .select("id,stem,model_answer,rationale,exam_tip,source_question_type,marks,topic_id", { count: "exact" })
    .eq("status", "published")
    .eq("subject_id", opts.subjectId);
  if (opts.topicId) query = query.eq("topic_id", opts.topicId);
  if (opts.type) query = query.eq("source_question_type", opts.type);

  const { data, count } = await query
    .order("source_question_type", { ascending: true })
    .order("created_at", { ascending: true })
    .range(page * PAGE, page * PAGE + PAGE - 1);

  return {
    questions: (data ?? []) as unknown as StudyQuestion[],
    total: count ?? 0,
    page,
    pageSize: PAGE,
  };
}

export async function getStudySubject(subjectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_subjects")
    .select("id,name,year_of_study,semester")
    .eq("id", subjectId)
    .maybeSingle();
  return data;
}

/** Distinct question types present in a subject, for the filter chips. */
export async function getStudyTypes(subjectId: string): Promise<{ type: string; count: number }[]> {
  const supabase = await createClient();
  const rows = await selectAll(supabase, (from, to) =>
    supabase
      .from("cns_study_questions")
      .select("source_question_type")
      .eq("status", "published")
      .eq("subject_id", subjectId)
      .range(from, to)
  );
  const counts = new Map<string, number>();
  for (const r of rows) {
    const t = (r.source_question_type as string) ?? "Other";
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}

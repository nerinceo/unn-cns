import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getStudySubjects } from "@/lib/cns/study";

/**
 * Question-bank reads.
 *
 * CRITICAL: never use select("*") on cns_questions or cns_question_options.
 * Table-level SELECT is revoked from `authenticated` and only the safe columns
 * are granted back, so a wildcard select returns 42501 "permission denied" —
 * that is the mechanism keeping answer keys out of the browser. Enumerate
 * columns, always.
 *
 * All reads go through the member's own session (RLS + column grants apply).
 * Answers are reachable only via the SECURITY DEFINER functions in
 * cns_question_bank.sql.
 */

// Safe projections. Kept as consts so a stray "*" is a visible mistake.
const Q_COLS =
  "id,question_type,stem,stem_media,difficulty,marks,negative_marks,topic_id,subject_id";
const OPT_COLS = "id,question_id,position,option_text,option_media";

export type CnsInstitution = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  country: string;
  institution_type: string;
};

export type CnsSubject = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  year_of_study: number | null;
  semester: number | null;
  institution_id: string | null;
};

export type CnsQuestionSet = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  set_type: string;
  duration_minutes: number | null;
  total_marks: number | null;
  pass_percentage: number | null;
  show_answers_mode: string;
  access_type: string;
  marketplace_listing_id: string | null;
  free_sample_count: number;
  subject_id: string | null;
  institution_id: string | null;
};

const SET_COLS =
  "id,slug,title,description,set_type,duration_minutes,total_marks,pass_percentage,show_answers_mode,access_type,marketplace_listing_id,free_sample_count,subject_id,institution_id";

export type CnsQuestion = {
  id: string;
  question_type: string;
  stem: string;
  stem_media: unknown;
  difficulty: string;
  marks: number;
  negative_marks: number;
  topic_id: string | null;
  subject_id: string | null;
  options: { id: string; position: number; option_text: string }[];
};

/**
 * Subjects that have at least one published set, grouped for the browse page.
 * `institutionId` scopes to one university.
 */
export async function getSubjectsWithSets(institutionId?: string) {
  const supabase = await createClient();

  let subjectQuery = supabase
    .from("cns_subjects")
    .select("id,slug,name,description,year_of_study,semester,position,institution_id")
    .eq("is_published", true);
  if (institutionId) subjectQuery = subjectQuery.eq("institution_id", institutionId);

  const [{ data: subjects }, { data: sets }] = await Promise.all([
    subjectQuery.order("position"),
    supabase.from("cns_question_sets").select(SET_COLS).eq("is_published", true).order("title"),
  ]);

  const byRelevance = (subjects ?? []).map((s) => ({
    ...(s as CnsSubject),
    sets: ((sets ?? []) as CnsQuestionSet[]).filter((q) => q.subject_id === s.id),
  }));

  // A subject with no published sets is noise on a browse page.
  return byRelevance.filter((s) => s.sets.length > 0);
}

export type BankSubject = {
  id: string;
  name: string;
  year_of_study: number | null;
  semester: number | null;
  institution_id: string | null;
  /** Published MCQ practice sets for this subject. */
  sets: CnsQuestionSet[];
  /** Published written/viva descriptive questions for this subject. */
  descriptiveCount: number;
};

/**
 * The whole bank, one row per subject.
 *
 * The bank has two halves stored in different tables — auto-graded MCQ sets
 * (cns_question_sets) and open-ended model-answer questions
 * (cns_study_questions) — and a learner thinks of them as one subject, not two
 * products. This merges them so the landing page can say "Pharmacology: 1
 * practice set, 112 descriptive questions" in a single card.
 *
 * Deliberately composed from the two existing readers rather than a new joined
 * query: each already encodes its own publication rules (subject is_published
 * for sets, per-question status for descriptive) and quietly unifying those would
 * change what either half shows today.
 */
export async function getBankSubjects(institutionId?: string): Promise<BankSubject[]> {
  const [withSets, withRevision] = await Promise.all([
    getSubjectsWithSets(institutionId),
    getStudySubjects(institutionId),
  ]);

  const merged = new Map<string, BankSubject>();
  for (const s of withSets) {
    merged.set(s.id, {
      id: s.id,
      name: s.name,
      year_of_study: s.year_of_study,
      semester: s.semester,
      institution_id: s.institution_id,
      sets: s.sets,
      descriptiveCount: 0,
    });
  }
  for (const s of withRevision) {
    const existing = merged.get(s.id);
    if (existing) existing.descriptiveCount = s.count;
    else
      merged.set(s.id, {
        id: s.id,
        name: s.name,
        year_of_study: s.year_of_study,
        semester: s.semester,
        institution_id: s.institution_id,
        sets: [],
        descriptiveCount: s.count,
      });
  }

  return Array.from(merged.values()).sort(
    (a, b) => (a.year_of_study ?? 99) - (b.year_of_study ?? 99) || a.name.localeCompare(b.name)
  );
}

export async function getQuestionSet(setId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_question_sets")
    .select(`${SET_COLS},shuffle_questions,shuffle_options`)
    .eq("id", setId)
    .eq("is_published", true)
    .maybeSingle();
  return data as (CnsQuestionSet & { shuffle_questions: boolean; shuffle_options: boolean }) | null;
}

// ---------------------------------------------------------------------------
// Institutions — the top level of the bank.
// ---------------------------------------------------------------------------

/**
 * All content is owned by a university. Today that is only RGUHS, but the
 * schema has been multi-tenant since day one (cns_institutions.slug is
 * commented 'rguhs', 'kuhs') and the browse tree now says so out loud: a
 * learner should never have to guess whose syllabus they are practising.
 *
 * RLS already restricts this to is_active rows, so no filter is needed here.
 */
export async function getInstitutions(): Promise<CnsInstitution[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_institutions")
    .select("id,slug,name,short_name,country,institution_type")
    .order("name");
  return (data ?? []) as CnsInstitution[];
}

export async function getInstitutionById(id: string | null): Promise<CnsInstitution | null> {
  if (!id) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_institutions")
    .select("id,slug,name,short_name,country,institution_type")
    .eq("id", id)
    .maybeSingle();
  return (data as CnsInstitution) ?? null;
}

export async function getInstitutionBySlug(slug: string): Promise<CnsInstitution | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_institutions")
    .select("id,slug,name,short_name,country,institution_type")
    .eq("slug", slug)
    .maybeSingle();
  return (data as CnsInstitution) ?? null;
}

/** Programs offered, e.g. "B.Sc Nursing — 4 years". */
export async function getInstitutionPrograms(institutionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_programs")
    .select("id,slug,name,duration_years")
    .eq("institution_id", institutionId)
    .order("name");
  return (data ?? []) as { id: string; slug: string; name: string; duration_years: number | null }[];
}

export type InstitutionWithBank = CnsInstitution & {
  programs: { id: string; slug: string; name: string; duration_years: number | null }[];
  subjectCount: number;
  setCount: number;
  descriptiveCount: number;
};

/**
 * Every university with a summary of what is actually inside its bank.
 *
 * The counts are derived from getBankSubjects rather than from head-count
 * queries against cns_questions, because that table has table-level SELECT
 * revoked and only safe columns granted back — a WHERE on `status` needs SELECT
 * on `status`, which the member role does not have, so the obvious count query
 * would return 42501. Counting published SETS sidesteps that entirely and is
 * the more useful number anyway: sets are what a learner opens.
 */
export async function getInstitutionsWithBank(): Promise<InstitutionWithBank[]> {
  const institutions = await getInstitutions();

  return Promise.all(
    institutions.map(async (inst) => {
      const [subjects, programs] = await Promise.all([
        getBankSubjects(inst.id),
        getInstitutionPrograms(inst.id),
      ]);
      return {
        ...inst,
        programs,
        subjectCount: subjects.length,
        setCount: subjects.reduce((n, s) => n + s.sets.length, 0),
        descriptiveCount: subjects.reduce((n, s) => n + s.descriptiveCount, 0),
      };
    })
  );
}

export async function getSetQuestionCount(setId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("cns_question_set_items")
    .select("id", { count: "exact", head: true })
    .eq("set_id", setId);
  return count ?? 0;
}

/** Ordered question ids for a set — used to freeze an attempt's order. */
export async function getSetQuestionIds(setId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_question_set_items")
    .select("question_id,position")
    .eq("set_id", setId)
    .order("position");
  return (data ?? []).map((r) => r.question_id as string);
}

/**
 * Hydrate questions for an attempt, in the attempt's frozen order.
 *
 * Returns options WITHOUT is_correct — not by filtering in JS, but because the
 * column is not readable at all. The browser physically cannot receive it.
 */
export async function getQuestionsByIds(ids: string[]): Promise<CnsQuestion[]> {
  if (!ids.length) return [];
  const supabase = await createClient();

  const [{ data: questions }, { data: options }] = await Promise.all([
    supabase.from("cns_questions").select(Q_COLS).in("id", ids),
    supabase.from("cns_question_options").select(OPT_COLS).in("question_id", ids).order("position"),
  ]);

  const optsByQ = new Map<string, CnsQuestion["options"]>();
  for (const o of options ?? []) {
    const list = optsByQ.get(o.question_id as string) ?? [];
    list.push({ id: o.id as string, position: o.position as number, option_text: o.option_text as string });
    optsByQ.set(o.question_id as string, list);
  }

  const byId = new Map(
    (questions ?? []).map((q) => [
      q.id as string,
      { ...(q as unknown as CnsQuestion), options: optsByQ.get(q.id as string) ?? [] },
    ])
  );

  // Preserve the attempt's frozen order, not whatever Postgres returned.
  return ids.map((id) => byId.get(id)).filter(Boolean) as CnsQuestion[];
}

export async function getAttempt(attemptId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_attempts")
    .select(
      "id,user_id,set_id,mode,status,question_ids,total_questions,correct_count,wrong_count,skipped_count,score,max_score,started_at,submitted_at,duration_seconds"
    )
    .eq("id", attemptId)
    .maybeSingle();
  return data;
}

export async function getAttemptResponses(attemptId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_attempt_responses")
    .select("question_id,selected_option_ids,answer_text,is_correct,marks_awarded,flagged")
    .eq("attempt_id", attemptId);
  return data ?? [];
}

/** Recent attempts for the signed-in member. */
export async function getMyAttempts(limit = 20) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_attempts")
    .select("id,set_id,status,score,max_score,correct_count,total_questions,started_at,submitted_at")
    .order("started_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

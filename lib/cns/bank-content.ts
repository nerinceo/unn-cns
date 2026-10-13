import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contentClient } from "@/lib/cns/bank-source";
import type { BankQuestion, SemesterSubject, TopicLabel } from "@/lib/cns/nursing-bank";
import type { StudyQuestion, StudySubject } from "@/lib/cns/study";

/**
 * The QB_SOURCE=content implementations behind nursing-bank.ts and study.ts.
 *
 * Every function here returns exactly the shape its legacy twin returns, so
 * the pages cannot tell the two sources apart. Three things differ underneath,
 * and each is translated at this boundary rather than leaking into a page:
 *
 *   Subject ids   legacy: cns_subjects uuid      content: subject_code ("SEM1_NF1")
 *   Question ids  legacy: cns_study_questions uuid   content: qb_questions id ("8")
 *   Topic ids     legacy: cns_topics uuid        content: "<subject_code>|<topic_code>"
 *
 * Old uuids still arrive from bookmarks, so resolveSubjectCode() and
 * resolveQuestionId() accept both forms: a legacy uuid is looked up in the main
 * project (its tables are kept for rollback) and mapped to its source key —
 * cns_subjects.slug is slugify(subject_code) and cns_study_questions.source_ref
 * is the qb_questions id, both by construction of scripts/import-rguhs.mjs.
 *
 * Institutions stay in the main project. A qbank subject belongs to the
 * institution whose slug is its lower-cased `university` ("RGUHS" -> "rguhs").
 */

const PAGE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The importer's slugify — keep identical, or legacy subject uuids stop resolving. */
const slugify = (s: string) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "x";

type RpcSubject = {
  id: string;
  name: string;
  university: string | null;
  course: string | null;
  year_of_study: number | null;
  semester: number | null;
  mcq_count: number;
  descriptive_count: number;
  total: number;
  published_total: number;
};

type RpcQuestion = {
  id: number;
  subject_id: string;
  subject_name: string | null;
  semester: number | null;
  unit_code: string | null;
  unit_name: string | null;
  topic_code: string | null;
  topic_name: string | null;
  source_question_type: string | null;
  marks: number | null;
  stem: string;
  model_answer: string | null;
  rationale: string | null;
  exam_tip: string | null;
  diagram_note: string | null;
  diagram_image_url: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_option: string | null;
  status: string | null;
  total_count?: number;
};

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T[]> {
  const { data, error } = await contentClient().rpc(fn, args);
  // Fail loudly. The legacy reads swallow errors into empty lists, but an
  // outage of a second project rendering as "0 questions" would be
  // indistinguishable from an empty bank.
  if (error) throw new Error(`question bank (${fn}): ${error.message}`);
  return (data ?? []) as T[];
}

/**
 * All subjects with counts. Not user-specific (the service key sees the whole
 * bank), so it is safe to share across requests; ten minutes keeps the semester
 * cards cheap while still picking up new questions the same day.
 */
const allSubjects = unstable_cache(() => rpc<RpcSubject>("qbank_subjects"), ["qbank-subjects"], {
  revalidate: 600,
  tags: ["qbank"],
});

const institutionSlug = cache(async (institutionId: string): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("cns_institutions").select("slug").eq("id", institutionId).maybeSingle();
  return (data?.slug as string) ?? null;
});

const institutionIdForUniversity = cache(async (university: string | null): Promise<string | null> => {
  if (!university) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_institutions")
    .select("id")
    .eq("slug", university.toLowerCase())
    .maybeSingle();
  return (data?.id as string) ?? null;
});

/**
 * Legacy subjects the source has since renamed. Their slug no longer matches a
 * subject_code, so a bookmark to them is mapped to the subject their questions
 * now belong to (measured 2026-09-28: each rename moved its questions as a
 * block — sem4-msn2 split 30/15, mapped to the majority). The legacy copy is
 * frozen, so this list cannot grow. Two further legacy subjects
 * (anatomy-physiology, fundamentals-of-nursing) never had questions and were
 * never listed, so they are deliberately absent.
 */
const RENAMED_SUBJECTS: Record<string, string> = {
  "sem1-nf": "SEM1_NF1",
  "sem1-physio": "SEM1_ANP",
  "sem3-msn1": "SEM3_AHN1",
  "sem3-patho": "SEM3_PATHO1",
  "sem4-genetics": "SEM4_PATHO2",
  "sem4-msn2": "SEM4_AHN2",
  "sem4-pharma": "SEM4_PHARM2",
  "sem5-mhn": "SEM5_MH1",
};

/** A subject key from either form: "SEM1_NF1" as-is, a legacy uuid via its slug. */
const resolveSubjectCode = cache(async (id: string): Promise<string | null> => {
  const subjects = await allSubjects();
  if (!UUID.test(id)) return subjects.some((s) => s.id === id) ? id : null;
  const supabase = await createClient();
  const { data } = await supabase.from("cns_subjects").select("slug").eq("id", id).maybeSingle();
  if (!data?.slug) return null;
  const direct = subjects.find((s) => slugify(s.id) === data.slug)?.id;
  const renamed = RENAMED_SUBJECTS[data.slug as string];
  return direct ?? (renamed && subjects.some((s) => s.id === renamed) ? renamed : null);
});

/** A question key from either form: "8" as-is, a legacy uuid via source_ref. */
async function resolveQuestionId(id: string): Promise<number | null> {
  if (/^\d+$/.test(id)) return Number(id);
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("cns_study_questions").select("source_ref").eq("id", id).maybeSingle();
  const ref = data?.source_ref;
  return ref != null && /^\d+$/.test(String(ref)) ? Number(ref) : null;
}

const topicKey = (subject: string, topic: string | null) => (topic ? `${subject}|${topic}` : null);

function toBankQuestion(r: RpcQuestion): BankQuestion {
  return {
    id: String(r.id),
    stem: r.stem,
    model_answer: r.model_answer,
    rationale: r.rationale,
    exam_tip: r.exam_tip,
    diagram_note: r.diagram_note,
    source_question_type: r.source_question_type,
    marks: r.marks,
    subject_id: r.subject_id,
    topic_id: topicKey(r.subject_id, r.topic_code),
    option_a: r.option_a,
    option_b: r.option_b,
    option_c: r.option_c,
    option_d: r.option_d,
    correct_option: r.correct_option,
  };
}

/**
 * One page of questions plus the full match count. A page past the end returns
 * no rows and therefore no total_count, so the total is re-read from page one —
 * the legacy count:"exact" query reported the total on every page.
 */
async function pagedQuestions(args: {
  subjectIds: string[];
  type?: string;
  search?: string;
  page: number;
  order: "mixed" | "type";
}): Promise<{ rows: RpcQuestion[]; total: number }> {
  const base = {
    p_subject_ids: args.subjectIds,
    p_type: args.type ?? null,
    p_search: args.search ?? null,
    p_limit: PAGE,
    p_order: args.order,
  };
  const rows = await rpc<RpcQuestion>("qbank_questions", { ...base, p_offset: args.page * PAGE });
  if (rows.length > 0 || args.page === 0) return { rows, total: Number(rows[0]?.total_count ?? 0) };
  const first = await rpc<RpcQuestion>("qbank_questions", { ...base, p_offset: 0, p_limit: 1 });
  return { rows, total: Number(first[0]?.total_count ?? 0) };
}

// --- nursing-bank.ts twins --------------------------------------------------

export async function contentBankRollup(institutionId: string): Promise<SemesterSubject[]> {
  const slug = await institutionSlug(institutionId);
  if (!slug) return [];
  const subjects = await allSubjects();
  return subjects
    .filter((s) => (s.university ?? "").toLowerCase() === slug)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      id: s.id,
      name: s.name,
      semester: s.semester ?? null,
      descriptiveCount: Number(s.descriptive_count),
      mcqCount: Number(s.mcq_count),
      total: Number(s.total),
    }));
}

export async function contentTopicIndex(subjectIds: string[]): Promise<Map<string, TopicLabel>> {
  const out = new Map<string, TopicLabel>();
  if (subjectIds.length === 0) return out;
  const rows = await rpc<{ subject_id: string; topic_code: string; topic_name: string; unit_name: string | null }>(
    "qbank_topics",
    { p_subject_ids: subjectIds }
  );
  for (const r of rows) {
    out.set(`${r.subject_id}|${r.topic_code}`, { name: r.topic_name, unitName: r.unit_name ?? null });
  }
  return out;
}

export async function contentSemesterQuestions(opts: {
  subjectIds: string[];
  subjectId?: string;
  type?: string;
  search?: string;
  page?: number;
}): Promise<{ questions: BankQuestion[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(0, opts.page ?? 0);
  const scope = opts.subjectId ? [opts.subjectId] : opts.subjectIds;
  if (scope.length === 0) return { questions: [], total: 0, page, pageSize: PAGE };
  const { rows, total } = await pagedQuestions({
    subjectIds: scope,
    type: opts.type,
    search: opts.search?.trim() || undefined,
    page,
    order: "mixed",
  });
  return { questions: rows.map(toBankQuestion), total, page, pageSize: PAGE };
}

/**
 * Several values per filter (2026-10-13): subjects, types, marks and topics,
 * through qbank_browse (supabase/content/0001_qbank_filters_samples.sql).
 */
export async function contentBrowseQuestions(opts: {
  subjectIds: string[];
  types: string[];
  marks: number[];
  topics: string[];
  search?: string;
  page?: number;
}): Promise<{ questions: BankQuestion[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(0, opts.page ?? 0);
  if (opts.subjectIds.length === 0) return { questions: [], total: 0, page, pageSize: PAGE };
  const base = {
    p_subject_ids: opts.subjectIds,
    p_types: opts.types.length ? opts.types : null,
    p_marks: opts.marks.length ? opts.marks : null,
    p_topics: opts.topics.length ? opts.topics : null,
    p_search: opts.search?.trim() || null,
    p_limit: PAGE,
  };
  const rows = await rpc<RpcQuestion>("qbank_browse", { ...base, p_offset: page * PAGE });
  let total = Number(rows[0]?.total_count ?? 0);
  if (rows.length === 0 && page > 0) {
    const first = await rpc<RpcQuestion>("qbank_browse", { ...base, p_offset: 0, p_limit: 1 });
    total = Number(first[0]?.total_count ?? 0);
  }
  return { questions: rows.map(toBankQuestion), total, page, pageSize: PAGE };
}

export async function contentSemesterMarks(subjectIds: string[]): Promise<{ marks: number; count: number }[]> {
  if (subjectIds.length === 0) return [];
  const rows = await rpc<{ marks: number; count: number }>("qbank_marks", { p_subject_ids: subjectIds });
  return rows.map((r) => ({ marks: Number(r.marks), count: Number(r.count) }));
}

/**
 * The fixed free samples for one semester (mixed types, same for everyone).
 * Shared across users, so cached like the subject list.
 */
export const contentSemesterSample = unstable_cache(
  async (subjectIds: string[], n: number): Promise<BankQuestion[]> => {
    if (subjectIds.length === 0) return [];
    const rows = await rpc<RpcQuestion>("qbank_sample", { p_subject_ids: subjectIds, p_n: n });
    return rows.map(toBankQuestion);
  },
  ["qbank-sample"],
  { revalidate: 600, tags: ["qbank"] }
);

export async function contentBankQuestion(id: string): Promise<BankQuestion | null> {
  const qid = await resolveQuestionId(id);
  if (qid == null) return null;
  const rows = await rpc<RpcQuestion>("qbank_question", { p_id: qid });
  return rows[0] ? toBankQuestion(rows[0]) : null;
}

export async function contentSemesterTypes(subjectIds: string[]): Promise<{ type: string; count: number }[]> {
  if (subjectIds.length === 0) return [];
  const rows = await rpc<{ type: string; count: number }>("qbank_types", { p_subject_ids: subjectIds });
  return rows
    .map((r) => ({ type: r.type, count: Number(r.count) }))
    .sort((a, b) => a.type.localeCompare(b.type));
}

// --- study.ts twins ---------------------------------------------------------

export async function contentStudySubjects(institutionId?: string): Promise<StudySubject[]> {
  const subjects = await allSubjects();
  const slug = institutionId ? await institutionSlug(institutionId) : null;
  if (institutionId && !slug) return [];
  const scoped = slug ? subjects.filter((s) => (s.university ?? "").toLowerCase() === slug) : subjects;
  const withInstitution = await Promise.all(
    scoped.map(async (s) => ({
      id: s.id,
      name: s.name,
      year_of_study: s.year_of_study ?? null,
      semester: s.semester ?? null,
      institution_id: institutionId ?? (await institutionIdForUniversity(s.university)),
      count: Number(s.total),
    }))
  );
  return withInstitution
    .filter((s) => s.count > 0)
    .sort((a, b) => (a.year_of_study ?? 99) - (b.year_of_study ?? 99) || a.name.localeCompare(b.name));
}

/**
 * `topicId` is accepted for signature parity and ignored: no page passes it,
 * and the source bank has no uuid topics for a legacy id to refer to.
 */
export async function contentStudyQuestions(opts: {
  subjectId: string;
  topicId?: string;
  type?: string;
  page?: number;
}): Promise<{ questions: StudyQuestion[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(0, opts.page ?? 0);
  const code = await resolveSubjectCode(opts.subjectId);
  if (!code) return { questions: [], total: 0, page, pageSize: PAGE };
  const { rows, total } = await pagedQuestions({ subjectIds: [code], type: opts.type, page, order: "type" });
  return {
    questions: rows.map((r) => ({
      id: String(r.id),
      stem: r.stem,
      model_answer: r.model_answer,
      rationale: r.rationale,
      exam_tip: r.exam_tip,
      diagram_note: r.diagram_note,
      source_question_type: r.source_question_type,
      marks: r.marks,
      topic_id: topicKey(r.subject_id, r.topic_code),
    })),
    total,
    page,
    pageSize: PAGE,
  };
}

export async function contentStudySubject(subjectId: string) {
  const code = await resolveSubjectCode(subjectId);
  if (!code) return null;
  const s = (await allSubjects()).find((x) => x.id === code);
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    year_of_study: s.year_of_study ?? null,
    semester: s.semester ?? null,
    institution_id: await institutionIdForUniversity(s.university),
  };
}

export async function contentStudyTypes(subjectId: string): Promise<{ type: string; count: number }[]> {
  const code = await resolveSubjectCode(subjectId);
  if (!code) return [];
  const rows = await rpc<{ type: string; count: number }>("qbank_types", { p_subject_ids: [code] });
  return rows.map((r) => ({ type: r.type, count: Number(r.count) })).sort((a, b) => b.count - a.count);
}

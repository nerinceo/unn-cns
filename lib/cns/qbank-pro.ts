import "server-only";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { contentClient } from "@/lib/cns/bank-source";
import { getBankAccess, type BankAccess } from "@/lib/cns/qbank-access";
import { getCurrentUser } from "@/lib/supabase/server";
import { bankIsReachable, decide, semesterModeOf, type ProMode } from "@/lib/cns/qbank-pro-gate";

/**
 * Question Bank Pro (Naveen, 2026-10-14): the nerusalem.in bank — every
 * question across 8 semesters, previous years, most important, mock and viva
 * exams, exam hacks and practice taplets — sold beside the RGUHS bank and
 * built as native CNS pages (app/(member)/question-bank/rguhs-pro) on the
 * nerusalem.in structure.
 *
 * Its own institution key, so it can never unlock (or be unlocked by) the
 * RGUHS bank: every existing check filters on institution 'rguhs', and
 * qbank_products is unique on (institution, course).
 *
 * Content lives in CONTENT schema qbank2 and is read only through the
 * server-only public.qbank2_* functions (supabase/content/0002–0004). Every
 * read here is gated by the member's purchase before it runs.
 */
export const PRO = { institution: "rguhs-pro", course: "bsc-nursing" } as const;
export const PRO_HOME = "/question-bank/rguhs-pro";

/** Free samples of an unbought semester (lists come capped by the gate at 10). */
export const PRO_SAMPLE = { mnemonics: 12, notes: 12, sos: 12, taplets: 10 } as const;

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await contentClient().rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

// ---------------------------------------------------------------------------
// Access

export interface ProContext {
  access: BankAccess;
  userId: string | null;
}

/** The member's Pro access; leaves for the paid-access panel when the bank is neither held nor on sale. */
export async function requireProBank(): Promise<ProContext> {
  const [access, user] = await Promise.all([getBankAccess(PRO.institution, PRO.course), getCurrentUser()]);
  if (!bankIsReachable(access)) redirect(`/question-bank?locked=${PRO.institution}`);
  return { access, userId: user?.id ?? null };
}

/** "full" or "sample" for one semester; a closed semester leaves for the bank's semester picker. */
export function requireSemesterMode(ctx: ProContext, semester: number): Exclude<ProMode, "closed"> {
  const mode = semesterModeOf(ctx.access, semester);
  if (mode === "closed") redirect(`${PRO_HOME}?locked=${semester}`);
  return mode;
}

export function parseSemester(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : null;
}

/**
 * One of the copied read functions, through the same gate as the exam API:
 * the semester decides, samples are capped. Returns null when refused.
 */
export async function gatedRead<T>(ctx: ProContext, fn: string, args: Record<string, unknown>): Promise<T | null> {
  const d = await decide(fn, args, {
    access: ctx.access,
    examInfo: getExamInfo,
    sampleExams: getSampleExams,
    hasSubmitted: async (kind, id) => (ctx.userId ? (await getAttempt(ctx.userId, kind, id)) != null : false),
  });
  if ("deny" in d) return null;
  if ("empty" in d) return [] as unknown as T;
  if ("read" in d) return (await proRead(d.read, d.args)) as T;
  return null;
}

// ---------------------------------------------------------------------------
// Copied functions (questions, previous years, most important, exams)

/** One of the 12 read functions, exactly as the source served it (see qbank2_rpc). */
export function proRead(fn: string, args: Record<string, unknown>): Promise<unknown> {
  return call("qbank2_rpc", { p_fn: fn, p_args: args });
}

/** semester + max score of a mock (written) or viva exam; null when there is none. */
export const getExamInfo = unstable_cache(
  async (kind: "written" | "viva", examId: number): Promise<{ semester: number; max_score: number } | null> => {
    const rows = await call<{ semester: number; max_score: number }[]>("qbank2_exam_semester", {
      p_kind: kind,
      p_exam_id: examId,
    });
    return rows?.[0] ?? null;
  },
  ["qbank2-exam-info"],
  { revalidate: 3600, tags: ["qbank2"] },
);

/** The free sample exam ids, as "written:3" → 17. */
export const getSampleExams = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const rows = await call<{ kind: string; semester: number; exam_id: number }[]>("qbank2_sample_exams", {});
    return Object.fromEntries((rows ?? []).map((r) => [`${r.kind}:${r.semester}`, Number(r.exam_id)]));
  },
  ["qbank2-sample-exams"],
  { revalidate: 3600, tags: ["qbank2"] },
);

/** A question as model_questions_page_v1 and miq_search return it. */
export interface ProQuestionRow {
  id: number;
  question: string;
  question_type: string | null;
  marks: number | null;
  answer: string | null;
  answer_formatted: string | null;
  rationale: string | null;
  exam_tip: string | null;
  correct_option: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  official_subject_name: string | null;
  official_unit_name: string | null;
  diagram_needed: boolean | null;
  importance_level?: string | null;
  source_group?: string | null;
}

/** The lettered options that have text, as [letter, text]. */
export function questionOptions(x: Pick<ProQuestionRow, "option_a" | "option_b" | "option_c" | "option_d">): [string, string][] {
  return ([["A", x.option_a], ["B", x.option_b], ["C", x.option_c], ["D", x.option_d]] as [string, string | null][]).filter(
    (o): o is [string, string] => o[1] != null && String(o[1]).trim() !== "",
  );
}

// ---------------------------------------------------------------------------
// Overview, exam hacks, taplets (supabase/content/0004)

export interface SemesterCounts {
  semester: number;
  model: number;
  previous: number;
  important: number;
  written: number;
  viva: number;
  mnemonics: number;
  notes: number;
  sos: number;
  taplet_papers: number;
  taplets: number;
}

export const getProOverview = unstable_cache(
  async (): Promise<SemesterCounts[]> => (await call<SemesterCounts[]>("qbank2_overview", {})) ?? [],
  ["qbank2-overview"],
  { revalidate: 3600, tags: ["qbank2"] },
);

export interface Mnemonic {
  id: number;
  subject: string;
  type: string;
  topic: string;
  label: string | null;
  sentence: string;
  meaning: string;
  style: string | null;
}
export interface Listing<T> {
  total: number;
  all: number;
  rows: T[];
}

export function getMnemonics(
  semester: number,
  f: { subject?: string; type?: string; q?: string; limit: number; offset: number },
) {
  return call<Listing<Mnemonic> & { subjects: string[]; types: string[] }>("qbank2_mnemonics", {
    p_semester: semester,
    p_subject: f.subject ?? null,
    p_type: f.type ?? null,
    p_search: f.q ?? null,
    p_limit: f.limit,
    p_offset: f.offset,
  });
}

export interface RevisionNote {
  /** qbank2.hack_notes.id — what progress keys on. */
  _id: number;
  id: string;
  subject?: string;
  unit_code?: string;
  unit_name?: string;
  topic?: string;
  type?: string;
  accent?: string;
  note?: string[] | string;
  html_parts?: string[];
  html?: string;
}

export function getNotes(
  semester: number,
  f: { subject?: string; unit?: string; type?: string; q?: string; limit: number; offset: number },
) {
  return call<Listing<RevisionNote> & { subjects: string[]; types: string[]; units: { code: string; name: string; subject: string }[] }>(
    "qbank2_notes",
    {
      p_semester: semester,
      p_subject: f.subject ?? null,
      p_unit: f.unit ?? null,
      p_type: f.type ?? null,
      p_search: f.q ?? null,
      p_limit: f.limit,
      p_offset: f.offset,
    },
  );
}

export interface SosCard {
  /** qbank2.hack_sos_cards.id — what progress keys on. */
  _id: number;
  id: string;
  category: string;
  title: string;
  summary?: string;
  steps?: string[];
  watch_out?: string;
  rescue_move?: string;
  theme?: string;
  semester?: number;
  paper_code?: string | number | null;
  paper_name?: string | null;
  topic?: string | null;
}
export interface SosDeck {
  product?: string;
  edition?: string;
  notice?: string;
  categories?: { slug: string; label: string; description?: string }[];
}

/** deck: "semester-1" … "semester-8" or "general". */
export function getSos(deck: string, f: { category?: string; paper?: string; q?: string; limit: number; offset: number }) {
  return call<
    Listing<SosCard> & { deck: SosDeck | null; category_counts: Record<string, number>; papers: { code: string; name: string }[] }
  >("qbank2_sos", {
    p_deck: deck,
    p_category: f.category ?? null,
    p_paper: f.paper ?? null,
    p_search: f.q ?? null,
    p_limit: f.limit,
    p_offset: f.offset,
  });
}

export interface TapletPaper {
  qp: string;
  title: string;
  tasks: number;
}
export interface TapletTask {
  kind: string;
  q: string;
  answer: string;
  options?: string[];
  correct?: number;
  explanation?: string;
}

export const getTapletPapers = unstable_cache(
  async (semester: number) => (await call<TapletPaper[]>("qbank2_taplet_papers", { p_semester: semester })) ?? [],
  ["qbank2-taplet-papers"],
  { revalidate: 3600, tags: ["qbank2"] },
);

export function getTapletPaper(qp: string, limit: number) {
  return call<{ paper: (TapletPaper & { semester: number }) | null; tasks: TapletTask[] }>("qbank2_taplet_paper", {
    p_qp: qp,
    p_limit: limit,
  });
}

/** "Applied Anatomy • 100 Practice Taplets | Nerusalem" → "Applied Anatomy". */
export function tapletSubject(title: string): string {
  return title.split(" • ")[0].split(" | ")[0].trim();
}

// ---------------------------------------------------------------------------
// Year filters (supabase/content/0006)

/** Repeat patterns over the last 4 exam years with full data — the source's "repeated" lens. */
export const REPEAT_PATTERNS = [
  { value: "all4", label: "In all 4 years" },
  { value: "three4", label: "In 3 of the last 4 years" },
  { value: "two4", label: "In 2 of the last 4 years" },
  { value: "any4", label: "In any of the last 4 years" },
  { value: "often", label: "Asked in 5+ different years" },
] as const;
export type RepeatPattern = (typeof REPEAT_PATTERNS)[number]["value"];

export interface YearOptions {
  window: number[];
  years: { year: number; count: number }[];
  patterns: Record<RepeatPattern, number>;
  schemes: Record<Scheme, number>;
}

/**
 * RGUHS syllabus scheme, by exam year (Naveen, 2026-10-15: "after 2022 new
 * scheme, before 2022 old scheme"). A question set in both eras is in both.
 */
export const NEW_SCHEME_FROM = 2022;
export const SCHEMES = [
  { value: "new", label: `New scheme (${NEW_SCHEME_FROM} onwards)` },
  { value: "old", label: `Old scheme (before ${NEW_SCHEME_FROM})` },
] as const;
export type Scheme = (typeof SCHEMES)[number]["value"];

/**
 * The years to filter on: those picked, narrowed to the scheme's era. A
 * scheme with no years picked is its whole era; picks outside the era match
 * nothing (an impossible year), never everything.
 */
export function filterYears(picked: number[], scheme: Scheme | undefined, offered: number[]): number[] | null {
  if (!scheme) return picked.length ? picked : null;
  const era = offered.filter((y) => (scheme === "new" ? y >= NEW_SCHEME_FROM : y < NEW_SCHEME_FROM));
  const years = picked.length ? picked.filter((y) => era.includes(y)) : era;
  return years.length ? years : [0];
}

export const getYearOptions = unstable_cache(
  async (semester: number, section: "previous" | "important"): Promise<YearOptions> =>
    call<YearOptions>("qbank2_year_options", { p_semester: semester, p_section: section }),
  ["qbank2-year-options"],
  { revalidate: 3600, tags: ["qbank2"] },
);

/** "2025,2024" from the URL → the years on offer, newest first. */
export function parseYears(v: string | undefined, offered: number[]): number[] {
  if (!v) return [];
  const set = new Set(v.split(",").map(Number).filter((n) => offered.includes(n)));
  return offered.filter((y) => set.has(y));
}

// ---------------------------------------------------------------------------
// Saved items, and where the member left off (0006). The done flag and the
// qbank2_progress RPC still exist in CONTENT but are no longer shown
// (Naveen, 2026-10-15: progress figures would overwhelm students).

export type MarkKind = "q" | "mnemonic" | "note" | "sos";
export type Marks = Record<string, { saved: boolean; done: boolean }>;

/** This member's marks on the items of one page. */
export async function getMarks(ctx: ProContext, kind: MarkKind, ids: (number | string)[]): Promise<Marks> {
  if (!ctx.userId || ids.length === 0) return {};
  return (await call<Marks>("qbank2_marks_get", { p_user: ctx.userId, p_kind: kind, p_items: ids.map(Number) })) ?? {};
}

export interface ResumePoint {
  semester: number;
  path: string;
  label: string;
  at: string;
}

/** "Last opened 15 Oct, 10:42 am" in Indian time. */
export function resumeWhen(at: string): string {
  return `Last opened ${new Date(at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`;
}

export async function getResume(ctx: ProContext): Promise<ResumePoint[]> {
  if (!ctx.userId) return [];
  return (await call<ResumePoint[]>("qbank2_resume_get", { p_user: ctx.userId })) ?? [];
}

/**
 * Remember this page as where the member is in a semester (0 = general SOS).
 * Never fails a page: progress is a convenience, the page is the product.
 */
export async function recordResume(ctx: ProContext, semester: number, path: string, label: string): Promise<void> {
  if (!ctx.userId || !path.startsWith(PRO_HOME)) return;
  try {
    await call("qbank2_resume_set", { p_user: ctx.userId, p_semester: semester, p_path: path.slice(0, 400), p_label: label.slice(0, 200) });
  } catch (e) {
    console.error("[qbank-pro] resume not recorded:", e instanceof Error ? e.message : e);
  }
}

export function getMarked(ctx: ProContext, kind: MarkKind, status: "saved" | "done", semester: number | null, limit: number, offset: number) {
  return call<{ total: number; rows: Record<string, unknown>[] }>("qbank2_marked", {
    p_user: ctx.userId,
    p_kind: kind,
    p_status: status,
    p_semester: semester,
    p_limit: limit,
    p_offset: offset,
  });
}

/** Which semester an item belongs to (null = the general SOS deck); undefined when there is no such item. */
export async function itemSemester(kind: MarkKind, item: number): Promise<number | null | undefined> {
  const rows = await call<{ found: boolean; semester: number | null }[]>("qbank2_item_semester", { p_kind: kind, p_item: item });
  return rows?.[0]?.found ? rows[0].semester : undefined;
}

export async function setMark(userId: string, kind: MarkKind, item: number, saved: boolean | null, done: boolean | null) {
  return call<{ saved: boolean; done: boolean }>("qbank2_mark_set", { p_user: userId, p_kind: kind, p_item: item, p_saved: saved, p_done: done });
}

// ---------------------------------------------------------------------------
// Mock exam attempts

export interface Attempt {
  submitted_at: string;
  self_score: number | null;
  max_score: number;
}

export async function getAttempt(userId: string, kind: "written" | "viva", examId: number): Promise<Attempt | null> {
  const rows = await call<Attempt[]>("qbank2_attempt_get", { p_user: userId, p_kind: kind, p_exam_id: examId });
  return rows?.[0] ?? null;
}

export async function submitAttempt(userId: string, kind: "written" | "viva", examId: number): Promise<Attempt> {
  const rows = await call<Attempt[]>("qbank2_attempt_submit", { p_user: userId, p_kind: kind, p_exam_id: examId });
  return rows[0];
}

export async function saveAttemptScore(
  userId: string,
  kind: "written" | "viva",
  examId: number,
  score: number,
): Promise<Attempt> {
  const rows = await call<Attempt[]>("qbank2_attempt_score", {
    p_user: userId,
    p_kind: kind,
    p_exam_id: examId,
    p_score: score,
  });
  return rows[0];
}

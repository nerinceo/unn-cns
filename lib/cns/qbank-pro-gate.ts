/**
 * Question Bank Pro — who may read what. Pure (no imports), so the exact rules
 * the route enforces are the ones the tests drive.
 *
 * Every data call names its semester, directly (p_semester, which each of the
 * six list functions filters on) or through its exam. That semester is either
 * bought ("full"), offered as a free sample ("sample": the bank is on sale), or
 * closed. Samples are fixed: the first page of each list with filters off, and
 * the first mock / viva exam of each semester.
 */

export interface ProAccess {
  all: boolean;
  semesters: Set<number>;
  buyUrl: string | null;
}

export type ProMode = "full" | "sample" | "closed";

export function semesterModeOf(a: ProAccess, semester: number): ProMode {
  if (a.all || a.semesters.has(semester)) return "full";
  return a.buyUrl != null ? "sample" : "closed";
}

/** The general Exam SOS deck belongs to no semester: any purchase opens it. */
export function generalModeOf(a: ProAccess): ProMode {
  if (a.all || a.semesters.size > 0) return "full";
  return a.buyUrl != null ? "sample" : "closed";
}

/**
 * Semesters whose saved items the member may see and change: bought ones only,
 * never samples (pre-launch audit 2026-10-15 — Save on a sample semester let a
 * free account read any answer through /saved). 0 stands for the general SOS
 * deck. Re-derived on every read, so a lapsed purchase hides what it saved.
 */
export function openSemesters(a: ProAccess): number[] {
  const out = Array.from({ length: 8 }, (_, i) => i + 1).filter((s) => semesterModeOf(a, s) === "full");
  return generalModeOf(a) === "full" ? [0, ...out] : out;
}

/** May the member Save an item listed in these semesters? (one bought is enough) */
export function maySave(a: ProAccess, semesters: number[]): boolean {
  const open = openSemesters(a);
  return semesters.some((s) => open.includes(s));
}

export function bankIsReachable(a: ProAccess): boolean {
  return a.all || a.semesters.size > 0 || a.buyUrl != null;
}

export function semesterParam(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : null;
}

/** Functions whose results are bounded by p_semester (verified in their bodies). */
const SEMESTER_READS = new Set([
  "model_question_filter_options_v1",
  "model_questions_page_v1",
  "get_previous_question_subjects",
  "get_previous_questions_page",
  "miq_filter_options",
  "miq_search",
]);
/** Exam titles and timings only — the same list for everyone who may open the bank. */
const CATALOG_READS = new Set(["get_written_exam_catalog", "get_viva_exam_catalog"]);
type Kind = "written" | "viva";
const EXAM_READS: Record<string, { kind: Kind; arg: string; key: boolean }> = {
  get_written_exam_paper: { kind: "written", arg: "p_mock_exam_id", key: false },
  get_mock_exam_answer_key: { kind: "written", arg: "p_mock_exam_id", key: true },
  get_viva_exam_questions: { kind: "viva", arg: "p_viva_exam_id", key: false },
  get_viva_exam_answer_key: { kind: "viva", arg: "p_viva_exam_id", key: true },
};

export const SAMPLE_PAGE = 10;

/**
 * Free samples of a paged list: its first 10, filters off. Anything past the
 * first page is empty, so a sample can't be paged or searched through to the
 * whole bank. Filter options and subject lists are names and counts only.
 */
function sampleArgs(fn: string, a: Record<string, unknown>): Record<string, unknown> | null {
  if (Number(a.p_offset ?? 0) > 0) return null;
  switch (fn) {
    case "model_questions_page_v1":
      return { p_semester: a.p_semester, p_subject: a.p_subject, p_limit: SAMPLE_PAGE, p_offset: 0 };
    case "get_previous_questions_page":
      return { p_semester: a.p_semester, p_subject_codes: a.p_subject_codes, p_search: "", p_limit: SAMPLE_PAGE, p_offset: 0 };
    case "miq_search":
      return { p_semester: a.p_semester, p_limit: SAMPLE_PAGE, p_offset: 0 };
    default:
      return a;
  }
}

function examIdOf(v: unknown): number | null {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export interface GateDeps {
  access: ProAccess;
  examInfo(kind: Kind, id: number): Promise<{ semester: number; max_score: number } | null>;
  sampleExams(): Promise<Record<string, number>>;
  hasSubmitted(kind: Kind, id: number): Promise<boolean>;
}

export type Decision =
  | { deny: number; message: string }
  | { empty: true }
  | { read: string; args: Record<string, unknown> }
  | { submit: { kind: Kind; id: number } };

const deny = (status: number, message: string): Decision => ({ deny: status, message });

export async function decide(fn: string, args: Record<string, unknown>, d: GateDeps): Promise<Decision> {
  if (!bankIsReachable(d.access)) return deny(403, "This question bank is not open to your account.");

  if (SEMESTER_READS.has(fn)) {
    const semester = semesterParam(args.p_semester);
    if (!semester) return deny(400, "Choose a semester.");
    const mode = semesterModeOf(d.access, semester);
    if (mode === "closed") return deny(403, `Semester ${semester} is not open to your account.`);
    if (mode === "full") return { read: fn, args };
    const capped = sampleArgs(fn, args);
    return capped ? { read: fn, args: capped } : { empty: true };
  }

  if (CATALOG_READS.has(fn)) return { read: fn, args: {} };

  const exam = EXAM_READS[fn];
  if (!exam && fn !== "qb2_submit") return deny(404, "Not found");

  const kind: Kind | null = exam ? exam.kind : args.p_kind === "viva" ? "viva" : args.p_kind === "written" ? "written" : null;
  const id = examIdOf(exam ? args[exam.arg] : args.p_exam_id);
  if (!kind || !id) return deny(400, "Unknown exam.");
  const info = await d.examInfo(kind, id);
  if (!info) return deny(404, "Exam not found.");
  const mode = semesterModeOf(d.access, info.semester);
  if (mode === "closed") return deny(403, `Semester ${info.semester} is not open to your account.`);
  if (mode === "sample" && (await d.sampleExams())[`${kind}:${info.semester}`] !== id) {
    return deny(
      403,
      `This ${kind === "written" ? "mock exam" : "viva"} is in the full Semester ${info.semester} bank. The first one is free to try — buy the semester to open the rest.`,
    );
  }

  if (fn === "qb2_submit") return { submit: { kind, id } };
  // The answer key opens only once the server holds the submission.
  if (exam.key && !(await d.hasSubmitted(kind, id))) return deny(403, "Submit the exam to unlock the answer key.");
  return { read: fn, args: { [exam.arg]: id } };
}

/**
 * Question Bank Pro mock and viva exams — the shapes the catalogue and the
 * runners share, and the source's names for the viva groups. Plain module so
 * client components can import it.
 */
export interface WrittenExam {
  mock_exam_id: number;
  semester: number;
  mock_number: number;
  title: string;
  total_marks: number;
  duration_minutes: number;
  instructions: string | null;
}
export interface VivaExam {
  viva_exam_id: number;
  viva_group_key: string;
  semester: number;
  viva_number: number;
  title: string;
  total_questions: number;
  duration_minutes: number;
}
export interface PaperQuestion {
  question_order: number;
  section_name: string | null;
  marks: number;
  is_choice: boolean;
  choice_group: string | null;
  question: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
}
export interface VivaQuestion {
  question_order: number;
  question: string;
  official_unit_name: string | null;
  official_subject_name: string | null;
}

/**
 * MCQ options as [letter, text], without the "B. " some source rows repeat
 * inside the text ("B. B. Validity"). Stripped only when at least two options
 * carry their own letter, so a real answer such as "C. difficile" survives.
 */
export function mcqOptions(o: { option_a?: string | null; option_b?: string | null; option_c?: string | null; option_d?: string | null }): [string, string][] {
  const pairs = ([["A", o.option_a], ["B", o.option_b], ["C", o.option_c], ["D", o.option_d]] as [string, string | null | undefined][]).filter(
    (p): p is [string, string] => p[1] != null && String(p[1]).trim() !== "",
  );
  const prefix = (l: string) => new RegExp(`^\\s*\\(?${l}[.)]\\s+`, "i");
  const strip = pairs.filter(([l, t]) => prefix(l).test(t)).length >= 2;
  return pairs.map(([l, t]) => [l, strip ? t.replace(prefix(l), "") : t]);
}

const text = (v: unknown) => (v == null ? null : String(v));

/** Only what the runner shows, never question_id (see /api/qbank-pro). */
export function toPaperQuestion(r: Record<string, unknown>): PaperQuestion {
  return {
    question_order: Number(r.question_order),
    section_name: text(r.section_name),
    marks: Number(r.marks),
    is_choice: r.is_choice === true,
    choice_group: text(r.choice_group),
    question: String(r.question ?? ""),
    option_a: text(r.option_a),
    option_b: text(r.option_b),
    option_c: text(r.option_c),
    option_d: text(r.option_d),
  };
}

export function toVivaQuestion(r: Record<string, unknown>): VivaQuestion {
  return {
    question_order: Number(r.question_order),
    question: String(r.question ?? ""),
    official_unit_name: text(r.official_unit_name),
    official_subject_name: text(r.official_subject_name),
  };
}

const VIVA_GROUPS: Record<string, string> = {
  VIVA_NF: "Nursing Foundation I & II",
  VIVA_AHN1: "Adult Health Nursing I",
  VIVA_AHN2: "Adult Health Nursing II",
  VIVA_CHN1: "Community Health Nursing I",
  VIVA_CHILD: "Child Health Nursing I & II",
  VIVA_MH: "Mental Health Nursing I & II",
  VIVA_CHN2: "Community Health Nursing II",
  VIVA_OBG: "Midwifery / OBG Nursing I & II",
};

export function vivaGroupName(key: string): string {
  return VIVA_GROUPS[key] ?? key;
}

/** "Applied Anatomy — Mock Exam 1" → "Applied Anatomy". */
export function writtenSubject(title: string): string {
  return title.split(" — ")[0].trim();
}

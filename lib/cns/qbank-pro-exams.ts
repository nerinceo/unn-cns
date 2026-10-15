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

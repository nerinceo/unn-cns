/**
 * UNN Learn — quiz and exam vocabulary for the player.
 *
 * Mirrors the labels in unn-uhn/lib/lms/quiz.ts, where instructors build these
 * (HUB migration 0076 holds the tables and the grading). Keep the two in step.
 */

export const QUIZ_MODES = ["quiz", "mock", "final"] as const;
export type QuizMode = (typeof QUIZ_MODES)[number];

export const QUIZ_MODE_LABEL: Record<QuizMode, string> = {
  quiz: "Practice quiz",
  mock: "Mock exam",
  final: "Final exam",
};

/** One question as the learner sees it — never with the answer. */
export type AttemptQuestion = { id: string; stem: string; options: { id: string; body: string }[] };

/** What lms_start_attempt() returns. */
export type AttemptPayload = {
  attempt_id: string;
  mode: QuizMode;
  started_at: string;
  deadline_at: string | null;
  server_now: string;
  questions: AttemptQuestion[];
  answers: Record<string, string>;
};

/** What lms_attempt_review() / lms_submit_attempt() return. */
export type AttemptReview = {
  attempt_id: string;
  mode: QuizMode;
  submitted_at: string;
  correct: number;
  total: number;
  percent: number;
  pass_percent: number;
  passed: boolean;
  /** False for a final exam the learner has neither passed nor run out of attempts on. */
  revealed: boolean;
  questions: {
    id: string;
    stem: string;
    explanation: string | null;
    chosen: string | null;
    is_correct: boolean;
    options: { id: string; body: string; is_correct: boolean }[];
  }[];
};

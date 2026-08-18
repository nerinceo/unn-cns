/**
 * Knockout screening — evaluating stored answers against the employer's rules.
 *
 * Pure so it runs in the employer inbox (server) and the composer preview
 * (client) from one definition. Evaluated at read time, never written back
 * onto the application: an employer who corrects a badly worded rule should
 * see the pipeline re-sort at once, and a candidate's answer must never be
 * mutated by a later edit to the question.
 */

export type ScreeningQuestion = {
  id: string;
  question: string;
  question_type: "short_answer" | "yes_no" | "number";
  is_required: boolean;
  knockout_expected: "yes" | "no" | null;
  knockout_min: number | null;
};

export type ScreeningAnswer = {
  question_id: string | null;
  question_text: string;
  answer: string | null;
};

export type ScreeningVerdict = {
  /** True only when every rule was met. No rules at all also means true. */
  meetsCriteria: boolean;
  /** How many rules this job defines. Zero means the tag is not shown. */
  ruleCount: number;
  metCount: number;
  /** Human-readable misses, for the tooltip on the "below bar" tag. */
  failures: string[];
  /** Rules whose answer could not be read — never counted as a pass. */
  unanswered: string[];
};

/** "Yes", " yes ", "Y", "true" all mean yes. Anything else is not a yes. */
function normaliseYesNo(raw: string | null): "yes" | "no" | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(v)) return "yes";
  if (["no", "n", "false", "0"].includes(v)) return "no";
  return null;
}

/**
 * First number in the answer. A `number` question renders as a numeric input,
 * but answers captured before the type existed are free text ("3 years"), and
 * silently failing those would misreport a qualified nurse as below the bar.
 */
function firstNumber(raw: string | null): number | null {
  const m = (raw ?? "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

export function evaluateScreening(
  questions: ScreeningQuestion[],
  answers: ScreeningAnswer[]
): ScreeningVerdict {
  const byQuestion = new Map<string, string | null>();
  for (const a of answers) {
    if (a.question_id) byQuestion.set(a.question_id, a.answer);
  }
  // Fallback for answers whose question was deleted after the fact: the text
  // is frozen on the answer row, so match on that rather than lose the rule.
  const byText = new Map<string, string | null>();
  for (const a of answers) byText.set(a.question_text.trim().toLowerCase(), a.answer);

  const failures: string[] = [];
  const unanswered: string[] = [];
  let ruleCount = 0;
  let metCount = 0;

  for (const q of questions) {
    const hasRule = q.knockout_expected !== null || q.knockout_min !== null;
    if (!hasRule) continue;
    ruleCount++;

    const raw = byQuestion.has(q.id)
      ? byQuestion.get(q.id)!
      : byText.get(q.question.trim().toLowerCase()) ?? null;

    if (raw === null || raw.trim() === "") {
      unanswered.push(q.question);
      continue;
    }

    if (q.knockout_expected !== null) {
      const got = normaliseYesNo(raw);
      if (got === null) unanswered.push(q.question);
      else if (got === q.knockout_expected) metCount++;
      else failures.push(`${q.question} — answered "${got}"`);
      continue;
    }

    if (q.knockout_min !== null) {
      const got = firstNumber(raw);
      if (got === null) unanswered.push(q.question);
      else if (got >= q.knockout_min) metCount++;
      else failures.push(`${q.question} — answered ${got}, needs ${q.knockout_min}+`);
    }
  }

  return {
    meetsCriteria: ruleCount > 0 && metCount === ruleCount,
    ruleCount,
    metCount,
    failures,
    unanswered,
  };
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  HelpCircle,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import {
  getQuizReview,
  saveQuizAnswer,
  startQuizAttempt,
  submitQuizAttempt,
} from "@/lib/actions/lms-quiz";
import { settle } from "@/lib/utils/settle";
import { QUIZ_MODE_LABEL, type AttemptPayload, type AttemptReview } from "@/lib/lms/quiz";
import type { PlayerQuiz } from "@/lib/cns/lms";

const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50";
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const btnOutline = `${btn} border border-border bg-background hover:bg-muted`;

function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type View =
  | { kind: "intro" }
  | { kind: "taking"; attempt: AttemptPayload }
  | { kind: "result"; review: AttemptReview };

export function QuizPlayer({
  lectureId,
  quiz,
  canTake,
  courseHasCertificate,
}: {
  lectureId: string;
  quiz: PlayerQuiz;
  /** Enrolled, the owner, or a free-preview lecture. */
  canTake: boolean;
  courseHasCertificate: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "intro" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different lecture is a different quiz: start from its intro.
  useEffect(() => {
    setView({ kind: "intro" });
    setError(null);
  }, [lectureId]);

  const begin = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await settle(startQuizAttempt(lectureId));
    setBusy(false);
    if ("error" in result) {
      setError(result.error ?? "Could not start the quiz.");
      router.refresh();
      return;
    }
    setView({ kind: "taking", attempt: result.attempt });
  }, [lectureId, router]);

  const showReview = useCallback(async (attemptId: string) => {
    setBusy(true);
    setError(null);
    const result = await settle(getQuizReview(attemptId));
    setBusy(false);
    if ("error" in result) setError(result.error ?? "Could not load the result.");
    else setView({ kind: "result", review: result.review });
  }, []);

  const finished = useCallback(
    (review: AttemptReview) => {
      setView({ kind: "result", review });
      router.refresh();
    },
    [router],
  );

  if (view.kind === "taking") {
    return <Attempt attempt={view.attempt} onFinished={finished} />;
  }

  if (view.kind === "result") {
    return (
      <Result
        review={view.review}
        courseHasCertificate={courseHasCertificate}
        onBack={() => setView({ kind: "intro" })}
      />
    );
  }

  // ── Intro ──────────────────────────────────────────────────────────────────
  const outOfAttempts = quiz.max_attempts !== null && quiz.attemptsUsed >= quiz.max_attempts;
  const passedFinal = quiz.mode === "final" && quiz.passed;
  const blocked: string | null = !canTake
    ? "Enrol in this course to take this quiz."
    : quiz.questions_per_attempt === 0
      ? "This quiz has no questions yet."
      : quiz.openAttemptId
        ? null
        : passedFinal
          ? "You have passed this exam."
          : outOfAttempts
            ? `You have used all ${quiz.max_attempts} attempts.`
            : quiz.nextAvailableAt
              ? `Your next attempt opens ${when(quiz.nextAvailableAt)}.`
              : null;

  const rules = [
    `${quiz.questions_per_attempt} question${quiz.questions_per_attempt === 1 ? "" : "s"}`,
    quiz.time_limit_min ? `${quiz.time_limit_min} minutes` : "No time limit",
    `Pass mark ${quiz.pass_percent}%`,
    quiz.max_attempts
      ? `${Math.max(0, quiz.max_attempts - quiz.attemptsUsed)} of ${quiz.max_attempts} attempts left`
      : "Unlimited attempts",
  ];

  return (
    <div className="p-6 sm:p-8">
      <div className="mx-auto max-w-xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <HelpCircle className="h-3.5 w-3.5" />
          {QUIZ_MODE_LABEL[quiz.mode]}
        </span>

        <ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>

        {quiz.mode === "final" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Pass this exam and finish every lecture to earn your certificate. Correct answers are shown once you
            pass{quiz.max_attempts ? " or use all your attempts" : ""}.
          </p>
        )}
        {quiz.time_limit_min && (
          <p className="mt-2 text-xs text-muted-foreground">
            The timer keeps running if you leave the page. When it ends, your saved answers are submitted.
          </p>
        )}

        {quiz.last && (
          <div className="mt-5 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
            <p>
              Last attempt:{" "}
              <span className={quiz.last.passed ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
                {quiz.last.percent}% · {quiz.last.passed ? "passed" : "not passed"}
              </span>
              {quiz.best !== null && quiz.best !== quiz.last.percent && (
                <span className="text-muted-foreground"> · best {quiz.best}%</span>
              )}
            </p>
            <button
              type="button"
              onClick={() => showReview(quiz.last!.id)}
              disabled={busy}
              className="mt-1 text-xs text-primary transition-opacity hover:opacity-80"
            >
              View result
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 flex items-start justify-center gap-1.5 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="mt-6">
          {blocked ? (
            <p className="text-sm text-muted-foreground">{blocked}</p>
          ) : (
            <button type="button" className={btnPrimary} onClick={begin} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {quiz.openAttemptId ? "Resume attempt" : quiz.attemptsUsed > 0 ? "Try again" : "Start"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Taking an attempt ────────────────────────────────────────────────────────

function Attempt({
  attempt,
  onFinished,
}: {
  attempt: AttemptPayload;
  onFinished: (review: AttemptReview) => void;
}) {
  const questions = attempt.questions;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(attempt.answers ?? {});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Saves are chained per question so two quick clicks reach the server in
  // the order they were made — otherwise the older choice could land last.
  const chains = useRef(new Map<string, Promise<void>>());

  // Clock skew: the deadline is the server's, so count down against the
  // server's notion of now, not the device's.
  const skewMs = useMemo(() => new Date(attempt.server_now).getTime() - Date.now(), [attempt.server_now]);
  const deadline = attempt.deadline_at ? new Date(attempt.deadline_at).getTime() : null;
  const [remaining, setRemaining] = useState<number | null>(
    deadline ? (deadline - (Date.now() + skewMs)) / 1000 : null,
  );

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    await Promise.all(Array.from(chains.current.values()));
    const result = await settle(submitQuizAttempt(attempt.attempt_id));
    if ("error" in result) {
      setSubmitting(false);
      setSubmitError(result.error ?? "Could not submit.");
      return;
    }
    onFinished(result.review);
  }, [attempt.attempt_id, onFinished, submitting]);

  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const left = (deadline - (Date.now() + skewMs)) / 1000;
      setRemaining(left);
      if (left <= 0 && !autoSubmitted.current) {
        autoSubmitted.current = true;
        void submit();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline, skewMs, submit]);

  function choose(questionId: string, optionId: string) {
    if (submitting) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    setSaveError(null);
    const previous = chains.current.get(questionId) ?? Promise.resolve();
    const next = previous.then(async () => {
      const result = await settle(saveQuizAnswer(attempt.attempt_id, questionId, optionId));
      if ("error" in result) setSaveError(result.error ?? "Your answer wasn't saved.");
    });
    chains.current.set(questionId, next);
  }

  const q = questions[index];
  const answered = questions.filter((x) => answers[x.id]).length;
  const unanswered = questions.length - answered;
  const lowTime = remaining !== null && remaining < 60;

  if (!q) {
    return <p className="p-6 text-sm text-muted-foreground">This attempt has no questions.</p>;
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          {QUIZ_MODE_LABEL[attempt.mode]} · Question {index + 1} of {questions.length}
        </p>
        <div className="flex items-center gap-3 text-sm">
          <span className="tabular-nums text-muted-foreground">
            {answered}/{questions.length} answered
          </span>
          {remaining !== null && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                lowTime ? "bg-red-50 text-red-700" : "bg-muted text-foreground"
              }`}
              aria-live={lowTime ? "polite" : "off"}
            >
              <Clock className="h-3.5 w-3.5" />
              {clock(remaining)}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background p-4 sm:p-5">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{q.stem}</p>
        <ul className="mt-4 space-y-2" role="radiogroup" aria-label={`Question ${index + 1}`}>
          {q.options.map((o) => {
            const selected = answers[q.id] === o.id;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={submitting}
                  onClick={() => choose(q.id, o.id)}
                  className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {selected ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span>{o.body}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {saveError && <p className="mt-2 text-xs text-red-700">{saveError}</p>}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          className={btnOutline}
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>
        {index < questions.length - 1 ? (
          <button type="button" className={btnPrimary} onClick={() => setIndex((i) => i + 1)}>
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <span />
        )}
      </div>

      {/* Navigator: jump to any question; filled = answered. */}
      <div className="mt-5 border-t border-border pt-4">
        <ol className="flex flex-wrap gap-1.5">
          {questions.map((x, i) => (
            <li key={x.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Question ${i + 1}${answers[x.id] ? ", answered" : ""}`}
                className={`h-8 w-8 rounded-md border text-xs tabular-nums transition-colors ${
                  i === index
                    ? "border-primary font-semibold text-primary"
                    : answers[x.id]
                      ? "border-primary/30 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {i + 1}
              </button>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {submitError && <p className="mr-auto text-xs text-red-700">{submitError}</p>}
          {confirming && unanswered > 0 ? (
            <>
              <span className="text-xs text-muted-foreground">
                {unanswered} unanswered — they count as wrong.
              </span>
              <button type="button" className={btnOutline} onClick={() => setConfirming(false)} disabled={submitting}>
                Keep going
              </button>
              <button type="button" className={btnPrimary} onClick={submit} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit anyway
              </button>
            </>
          ) : (
            <button
              type="button"
              className={btnPrimary}
              disabled={submitting}
              onClick={() => (unanswered > 0 ? setConfirming(true) : submit())}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Result ───────────────────────────────────────────────────────────────────

function Result({
  review,
  courseHasCertificate,
  onBack,
}: {
  review: AttemptReview;
  courseHasCertificate: boolean;
  onBack: () => void;
}) {
  return (
    <div className="p-4 sm:p-6">
      <div
        className={`rounded-xl border p-5 text-center ${
          review.passed ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
        }`}
      >
        {review.passed ? (
          <Award className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
        ) : (
          <RotateCcw className="mx-auto mb-2 h-8 w-8 text-amber-600" />
        )}
        <p className={`text-2xl font-semibold tabular-nums ${review.passed ? "text-emerald-900" : "text-amber-900"}`}>
          {review.percent}%
        </p>
        <p className={`mt-1 text-sm ${review.passed ? "text-emerald-800" : "text-amber-800"}`}>
          {review.correct} of {review.total} correct · pass mark {review.pass_percent}% ·{" "}
          <strong>{review.passed ? "Passed" : "Not passed"}</strong>
        </p>
        {review.mode === "final" && review.passed && (
          <p className="mt-2 text-xs text-emerald-800">
            {courseHasCertificate
              ? "Your certificate is ready."
              : "Finish every lecture in the course and your certificate is issued automatically."}
          </p>
        )}
      </div>

      {!review.revealed ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Correct answers for the final exam are shown once you pass or have used all your attempts.
        </p>
      ) : (
        <ol className="mt-5 space-y-3">
          {review.questions.map((q, i) => (
            <li key={q.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-start gap-2">
                {q.is_correct ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                )}
                <p className="whitespace-pre-wrap text-sm">
                  <span className="mr-1 font-medium text-muted-foreground">{i + 1}.</span>
                  {q.stem}
                </p>
              </div>
              <ul className="mt-3 space-y-1.5 pl-6">
                {q.options.map((o) => {
                  const chosen = q.chosen === o.id;
                  return (
                    <li
                      key={o.id}
                      className={`rounded-md px-2.5 py-1.5 text-sm ${
                        o.is_correct
                          ? "bg-emerald-50 text-emerald-900"
                          : chosen
                            ? "bg-red-50 text-red-900"
                            : "text-muted-foreground"
                      }`}
                    >
                      {o.body}
                      {o.is_correct && <span className="ml-2 text-xs font-medium">Correct answer</span>}
                      {chosen && !o.is_correct && <span className="ml-2 text-xs font-medium">Your answer</span>}
                    </li>
                  );
                })}
                {!q.chosen && <li className="px-2.5 text-xs text-muted-foreground">Not answered</li>}
              </ul>
              {q.explanation && (
                <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Explanation: </span>
                  {q.explanation}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-5 text-center">
        <button type="button" className={btnOutline} onClick={onBack}>
          Back to {QUIZ_MODE_LABEL[review.mode].toLowerCase()}
        </button>
      </div>
    </div>
  );
}

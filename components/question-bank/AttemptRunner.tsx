"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, Loader2, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { saveResponse, submitAttempt } from "@/lib/actions/attempts";
import type { CnsQuestion } from "@/lib/cns/question-bank";

type Saved = {
  selected: string[];
  text: string;
  flagged: boolean;
};

export function AttemptRunner({
  attemptId,
  questions,
  initial,
  durationMinutes,
  startedAt,
}: {
  attemptId: string;
  questions: CnsQuestion[];
  initial: Record<string, Saved>;
  durationMinutes: number | null;
  startedAt: string;
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Saved>>(initial);
  const [submitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const questionEnteredAt = useRef(Date.now());

  const q = questions[idx];
  const current = answers[q.id] ?? { selected: [], text: "", flagged: false };
  const isMulti = q.question_type === "mcq_multi";
  const isText = q.question_type === "fill_blank" || q.question_type === "short_answer";

  // ---- countdown ----------------------------------------------------------
  const deadline = useMemo(
    () => (durationMinutes ? new Date(startedAt).getTime() + durationMinutes * 60_000 : null),
    [durationMinutes, startedAt]
  );
  const [remaining, setRemaining] = useState<number | null>(
    deadline ? Math.max(0, deadline - Date.now()) : null
  );

  const doSubmit = useCallback(() => {
    startSubmit(async () => {
      const res = await submitAttempt(attemptId);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.push(`/question-bank/attempt/${attemptId}/result`);
    });
  }, [attemptId, router]);

  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      setRemaining(left);
      // Auto-submit on expiry so a timed set cannot be left open indefinitely.
      if (left === 0) {
        clearInterval(t);
        doSubmit();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, doSubmit]);

  // ---- persistence --------------------------------------------------------
  // Every change is written immediately. A dropped connection or an accidental
  // reload must never cost the learner their answers.
  const persist = useCallback(
    (questionId: string, next: Saved) => {
      const spent = Math.round((Date.now() - questionEnteredAt.current) / 1000);
      void saveResponse(attemptId, questionId, {
        selectedOptionIds: next.selected,
        answerText: next.text || undefined,
        flagged: next.flagged,
        timeSpent: spent,
      });
    },
    [attemptId]
  );

  function update(next: Partial<Saved>) {
    const merged = { ...current, ...next };
    setAnswers((a) => ({ ...a, [q.id]: merged }));
    persist(q.id, merged);
  }

  function toggleOption(optionId: string) {
    const selected = isMulti
      ? current.selected.includes(optionId)
        ? current.selected.filter((x) => x !== optionId)
        : [...current.selected, optionId]
      : [optionId];
    update({ selected });
  }

  function goTo(i: number) {
    if (i < 0 || i >= questions.length) return;
    questionEnteredAt.current = Date.now();
    setIdx(i);
  }

  const answeredCount = questions.filter((x) => {
    const a = answers[x.id];
    return a && (a.selected.length > 0 || a.text.trim() !== "");
  }).length;

  return (
    <div className="space-y-6">
      {/* header ---------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Question <span className="font-medium text-foreground">{idx + 1}</span> of{" "}
          {questions.length} · {answeredCount} answered
        </p>
        {remaining !== null && (
          <p
            className={cn(
              "rounded-md px-2.5 py-1 font-mono text-sm tabular-nums",
              remaining < 60_000 ? "bg-secondary text-secondary-foreground" : "bg-muted"
            )}
          >
            {String(Math.floor(remaining / 60000)).padStart(2, "0")}:
            {String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}
          </p>
        )}
      </div>

      {/* question navigator ---------------------------------------------- */}
      <div className="flex flex-wrap gap-1.5">
        {questions.map((x, i) => {
          const a = answers[x.id];
          const done = a && (a.selected.length > 0 || a.text.trim() !== "");
          return (
            <button
              key={x.id}
              onClick={() => goTo(i)}
              aria-label={`Go to question ${i + 1}`}
              aria-current={i === idx ? "true" : undefined}
              className={cn(
                "h-8 w-8 rounded-md border text-xs font-medium transition-colors",
                i === idx
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40",
                a?.flagged && "ring-2 ring-secondary ring-offset-1"
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* question -------------------------------------------------------- */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-muted px-2 py-0.5 capitalize text-muted-foreground">
              {q.difficulty}
            </span>
            <span className="text-muted-foreground">
              {q.marks} mark{q.marks === 1 ? "" : "s"}
              {Number(q.negative_marks) > 0 && ` · −${q.negative_marks} if wrong`}
            </span>
            {isMulti && (
              <span className="rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">
                Select all that apply
              </span>
            )}
          </div>
          <button
            onClick={() => update({ flagged: !current.flagged })}
            aria-pressed={current.flagged}
            className={cn(
              "shrink-0 rounded-md p-1.5 transition-colors",
              current.flagged ? "text-secondary" : "text-muted-foreground hover:text-foreground"
            )}
            title={current.flagged ? "Unflag" : "Flag for review"}
          >
            <Flag className={cn("h-4 w-4", current.flagged && "fill-current")} />
          </button>
        </div>

        <p className="whitespace-pre-line text-base leading-relaxed">{q.stem}</p>

        <div className="mt-5 space-y-2">
          {isText ? (
            <Input
              value={current.text}
              onChange={(e) => update({ text: e.target.value })}
              placeholder="Type your answer"
              className="max-w-md"
            />
          ) : (
            q.options.map((opt, i) => {
              const picked = current.selected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => toggleOption(opt.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
                    picked
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/40"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-[11px] font-medium",
                      isMulti ? "rounded" : "rounded-full",
                      picked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {/* Label from RENDER ORDER, not opt.position.
                        `65 + opt.position - 1` assumed position was 1-based, but
                        1,239 of 1,250 questions store it 0-based — and 65 + 0 - 1
                        is char code 64, which is "@". So virtually the whole bank
                        showed "@ A B C" instead of "A B C D".
                        The rows arrive ordered by position (see OPT_COLS query in
                        lib/cns/question-bank.ts), so the array index is already the
                        display order and is immune to 0-based, 1-based or gapped
                        data. Deliberately NOT fixed by renumbering the table:
                        position is the stored ordering key, and rewriting 1,239
                        questions to satisfy a display bug risks the answer key. */}
                    {picked ? <Check className="h-3 w-3" /> : String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-sm">{opt.option_text}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* nav ------------------------------------------------------------- */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => goTo(idx - 1)} disabled={idx === 0}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Previous
        </Button>

        {idx === questions.length - 1 ? (
          <Button onClick={doSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
              </>
            ) : (
              "Submit attempt"
            )}
          </Button>
        ) : (
          <Button onClick={() => goTo(idx + 1)}>
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>

      {answeredCount < questions.length && idx === questions.length - 1 && (
        <p className="text-center text-sm text-muted-foreground">
          {questions.length - answeredCount} unanswered. Skipped questions score zero but lose no
          marks.
        </p>
      )}
      {error && <p className="text-center text-sm text-secondary">{error}</p>}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, KeyRound, Lock, Play, Send } from "lucide-react";
import { AnswerHtml } from "@/components/question-bank/pro/ProQuestionCard";
import { mcqOptions, type PaperQuestion, type VivaQuestion } from "@/lib/cns/qbank-pro-exams";

/**
 * Question Bank Pro mock exams (nerusalem.in mock-exams.html, flow per Naveen
 * 2026-10-14): read the paper, Start, then Submit — or let the timer reach
 * zero — and the answer key opens. Students evaluate themselves against it;
 * there is no score (Naveen, 2026-10-15). Only the submission is recorded.
 *
 * The timer's end time is kept in this browser, so a reload carries on the
 * same exam. The submission lives on the server, which is also
 * what unlocks the key: /api/qbank-pro refuses it until the attempt exists.
 */

type Kind = "written" | "viva";
interface KeyRow {
  question_order: number;
  question: string;
  marks?: number;
  correct_option?: string | null;
  option_a?: string | null;
  option_b?: string | null;
  option_c?: string | null;
  option_d?: string | null;
  key_points?: string | null;
  answer_html: string | null;
  rationale_html: string | null;
  tip_html?: string | null;
}

async function api<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/qbank-pro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fn, args }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.message) || "The question bank could not be reached.");
  return body as T;
}

const clock = (s: number) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, "0")}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

/** Start → timer → submit, and the key afterwards. Shared by both runners. */
function useExam(kind: Kind, examId: number, minutes: number, initiallySubmitted: boolean) {
  const storeKey = `qbank-pro:${kind}:${examId}`;
  const [phase, setPhase] = useState<"ready" | "running" | "done">(initiallySubmitted ? "done" : "ready");
  const [endAt, setEndAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [key, setKey] = useState<KeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await api("qb2_submit", { p_kind: kind, p_exam_id: examId });
      try {
        localStorage.removeItem(storeKey);
      } catch {}
      setPhase("done");
      setKey(await api<KeyRow[]>(kind === "written" ? "get_mock_exam_answer_key" : "get_viva_exam_answer_key", kind === "written" ? { p_mock_exam_id: examId } : { p_viva_exam_id: examId }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [kind, examId, storeKey]);

  // Resume a running exam after a reload; a finished one shows its key.
  useEffect(() => {
    if (initiallySubmitted) {
      api<KeyRow[]>(kind === "written" ? "get_mock_exam_answer_key" : "get_viva_exam_answer_key", kind === "written" ? { p_mock_exam_id: examId } : { p_viva_exam_id: examId })
        .then(setKey)
        .catch((e) => setError((e as Error).message));
      return;
    }
    try {
      const stored = Number(localStorage.getItem(storeKey));
      if (stored) {
        setEndAt(stored);
        setPhase("running");
      }
    } catch {}
  }, [initiallySubmitted, kind, examId, storeKey]);

  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase]);

  const remaining = endAt ? Math.ceil((endAt - now) / 1000) : minutes * 60;
  // Time up submits ONCE. If that fails the error shows and Submit stays for a
  // manual retry, rather than re-posting every render.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (phase === "running" && endAt && remaining <= 0 && !busy && !autoSubmitted.current) {
      autoSubmitted.current = true;
      void submit();
    }
  }, [phase, endAt, remaining, busy, submit]);

  const start = () => {
    const end = Date.now() + minutes * 60_000;
    try {
      localStorage.setItem(storeKey, String(end));
    } catch {}
    setEndAt(end);
    setNow(Date.now());
    setPhase("running");
  };

  return { phase, remaining, key, error, busy, start, submit };
}

function TopBar({
  backHref,
  title,
  subtitle,
  right,
}: {
  backHref: string;
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="sticky top-16 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:-mx-10 xl:px-10">
      <div className="flex items-center gap-3">
        <Link href={backHref} className="inline-flex h-10 shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-[14px] font-semibold text-slate-700 hover:border-primary hover:text-primary dark:text-slate-300">
          <ChevronLeft className="h-4 w-4" /> <span className="sr-only sm:not-sr-only">Back</span>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] font-bold leading-snug text-foreground sm:truncate sm:text-[16px]">{title}</p>
          <p className="hidden truncate text-[13px] text-muted-foreground sm:block">{subtitle}</p>
        </div>
        {right}
      </div>
    </div>
  );
}

function Timer({ seconds, done }: { seconds: number; done: boolean }) {
  return (
    <span
      className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-[15px] font-bold tabular-nums ${
        done ? (seconds <= 0 ? "bg-danger-soft text-danger" : "bg-muted text-slate-600 dark:text-slate-300") : seconds <= 300 ? "bg-warning-soft text-warning" : "bg-brand-50 text-primary"
      }`}
    >
      <Clock className="h-4 w-4" />
      {/* Submitted early is not "Time up" (go-live check, 2026-10-15). */}
      {done ? (seconds <= 0 ? "Time up" : "Submitted") : clock(seconds)}
    </span>
  );
}

function Instructions({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-[14px] leading-relaxed text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200/90">{children}</div>;
}

function KeyList({ rows }: { rows: KeyRow[] }) {
  return (
    <ol className="space-y-4">
      {rows.map((r) => {
        const correct = r.correct_option ? String(r.correct_option).toUpperCase() : null;
        const chosen = correct ? (mcqOptions(r).find(([l]) => l === correct.toUpperCase())?.[1] ?? null) : null;
        const points = String(r.key_points ?? "")
          .split("|")
          .map((p) => p.trim())
          .filter(Boolean);
        return (
          <li key={r.question_order} className="rounded-xl border border-border bg-card p-5">
            <p className="flex items-start justify-between gap-3 text-[16px] font-semibold leading-relaxed">
              <span>
                {r.question_order}. {r.question}
              </span>
              {r.marks != null && <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[12px] font-semibold text-slate-600 dark:text-slate-300">{Number(r.marks)} marks</span>}
            </p>
            {correct && (
              <p className="mt-3 text-[15px]">
                <span className="font-bold text-primary dark:text-blue-300">Correct option: </span>
                <span className="font-bold text-success">{correct}</span>
                {chosen ? ` — ${chosen}` : ""}
              </p>
            )}
            <div className="mt-3 border-l-[3px] border-primary/30 pl-3.5">
              <p className="text-[14px] font-bold text-primary dark:text-blue-300">{points.length ? "Model answer" : "Answer"}</p>
              <AnswerHtml html={r.answer_html ?? "<p>Answer not available.</p>"} />
            </div>
            {r.rationale_html && (
              <div className="mt-3 border-l-[3px] border-primary/30 pl-3.5">
                <p className="text-[14px] font-bold text-primary dark:text-blue-300">Rationale</p>
                <AnswerHtml html={r.rationale_html} />
              </div>
            )}
            {r.tip_html && (
              <div className="mt-3 border-l-[3px] border-primary/30 pl-3.5">
                <p className="text-[14px] font-bold text-primary dark:text-blue-300">Exam Tip</p>
                <AnswerHtml html={r.tip_html} />
              </div>
            )}
            {points.length > 0 && (
              <div className="mt-3">
                <p className="text-[14px] font-bold text-primary dark:text-blue-300">Key points</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {points.map((p) => (
                    <span key={p} className="rounded-full bg-brand-50 px-3 py-1 text-[13px] font-semibold text-primary ring-1 ring-inset ring-primary/15">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------

export function WrittenExamRunner({
  examId,
  title,
  semester,
  mockNumber,
  totalMarks,
  minutes,
  questions,
  backHref,
  submitted,
}: {
  examId: number;
  title: string;
  semester: number;
  mockNumber: number;
  totalMarks: number;
  minutes: number;
  questions: PaperQuestion[];
  backHref: string;
  submitted: boolean;
}) {
  const x = useExam("written", examId, minutes, submitted);
  const sections = useMemo(() => {
    const out: { name: string; items: PaperQuestion[] }[] = [];
    for (const q of questions) {
      const name = q.section_name || "Questions";
      const s = out.find((o) => o.name === name);
      if (s) s.items.push(q);
      else out.push({ name, items: [q] });
    }
    return out;
  }, [questions]);

  const right =
    x.phase === "ready" ? (
      <button type="button" onClick={x.start} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-[14px] font-semibold text-primary-foreground hover:opacity-90">
        <Play className="h-4 w-4" /> Start Exam · {minutes} min
      </button>
    ) : (
      <Timer seconds={x.remaining} done={x.phase === "done"} />
    );

  return (
    <div className="space-y-5">
      <TopBar
        backHref={backHref}
        title={title}
        subtitle={x.phase === "ready" ? "Read the paper first. Start the timer when you are ready." : x.phase === "running" ? "Exam in progress" : "Exam submitted — answer key below"}
        right={right}
      />

      {x.phase !== "done" && (
        <>
          <section className="rounded-2xl border border-border bg-card p-6 text-center">
            <p className="text-[13px] font-bold uppercase tracking-wider text-primary">
              Semester {semester} · Mock Exam {mockNumber}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-[14px] font-semibold text-muted-foreground">
              {totalMarks} marks · {minutes} min
            </p>
          </section>

          <Instructions>
            <strong className="font-bold">Mock exam · self-evaluation.</strong> Read the paper before starting — the timer does not begin when you open it.
            Press <strong>Start Exam</strong> when ready; the answer key unlocks when you press <strong>Submit</strong> or the timer reaches zero.
            Write your answers separately, then compare them with the model answers.
          </Instructions>

          <section className="space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
            {sections.map((s) => (
              <div key={s.name}>
                <h2 className="border-b border-border pb-2 text-[17px] font-bold text-primary">{s.name}</h2>
                <ol className="mt-3 space-y-4">
                  {s.items.map((q) => {
                    const options = mcqOptions(q);
                    return (
                      <li key={q.question_order} className="flex gap-3">
                        <span className="w-7 shrink-0 text-[16px] font-bold tabular-nums text-primary">{q.question_order}.</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[16px] leading-relaxed text-foreground">{q.question}</p>
                          {q.is_choice && q.choice_group && <p className="mt-1 text-[12.5px] font-bold text-primary">Choice group: {q.choice_group}</p>}
                          {options.length > 0 && (
                            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                              {options.map(([l, v]) => (
                                <li key={l} className="rounded-lg border border-border/70 px-3 py-2 text-[15px]">
                                  <span className="font-bold text-primary">{l}.</span> {v}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-muted-foreground">
                          {q.marks} {Number(q.marks) === 1 ? "mark" : "marks"}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </section>
        </>
      )}

      {x.error && <p className="rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{x.error}</p>}

      {x.phase === "ready" && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-[14px] text-muted-foreground">
          <Lock className="h-4 w-4" /> Answer key locked — start the exam, then submit to unlock it.
        </div>
      )}
      {x.phase === "running" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-[14px] text-muted-foreground">
            <Lock className="h-4 w-4" /> Answer key unlocks when you submit or the timer reaches zero.
          </p>
          <button
            type="button"
            disabled={x.busy}
            onClick={() => {
              if (confirm("Submit this exam now? The timer stops and the answer key unlocks.")) void x.submit();
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-5 text-[14px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Submit Exam
          </button>
        </div>
      )}

      {x.phase === "done" && (
        <>
          <div className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success-soft p-5">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <p className="text-[14px] text-foreground">
              <strong className="font-bold">Answer key unlocked.</strong> Compare your written answers with the model answers below.
            </p>
          </div>
          {x.key ? <KeyList rows={x.key} /> : !x.error && <p className="text-[14px] text-muted-foreground">Loading the answer key…</p>}
        </>
      )}
    </div>
  );
}

export function VivaExamRunner({
  examId,
  title,
  vivaNumber,
  minutes,
  questions,
  backHref,
  submitted,
}: {
  examId: number;
  title: string;
  vivaNumber: number;
  minutes: number;
  questions: VivaQuestion[];
  backHref: string;
  submitted: boolean;
}) {
  const x = useExam("viva", examId, minutes, submitted);
  const [i, setI] = useState(0);
  const q = questions[i];

  return (
    <div className="space-y-5">
      <TopBar
        backHref={backHref}
        title={title}
        subtitle={`Viva ${vivaNumber} · ${x.phase === "ready" ? "Ready" : x.phase === "running" ? "In progress" : "Submitted"}`}
        right={x.phase === "ready" ? undefined : <Timer seconds={x.remaining} done={x.phase === "done"} />}
      />

      {x.phase === "ready" && (
        <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 sm:p-8">
          <p className="text-[13px] font-bold uppercase tracking-wider text-primary">Viva exam</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-[13px] font-semibold text-slate-600 dark:text-slate-300">
            <span className="rounded-md bg-muted px-2 py-1">{questions.length} questions</span>
            <span className="rounded-md bg-muted px-2 py-1">{minutes} min</span>
            <span className="rounded-md bg-muted px-2 py-1">Answer orally</span>
          </div>
          <div className="mt-5">
            <Instructions>
              <strong className="font-bold">Viva practice · self-evaluation.</strong> Answer each question aloud before moving on. The viva starts only when you
              press Start Viva; model answers and key points unlock when you submit or the timer reaches zero.
            </Instructions>
          </div>
          <button type="button" onClick={x.start} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground hover:opacity-90">
            <Play className="h-4 w-4" /> Start Viva
          </button>
        </section>
      )}

      {x.phase === "running" && q && (
        <section className="mx-auto max-w-2xl space-y-4">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((i + 1) / questions.length) * 100}%` }} />
          </div>
          <article className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <p className="text-[13px] font-bold uppercase tracking-wider text-primary">
              Question {i + 1} of {questions.length}
            </p>
            <h2 className="mt-2 text-[22px] font-bold leading-snug">{q.question}</h2>
            {(q.official_unit_name || q.official_subject_name) && (
              <span className="mt-3 inline-block rounded-full bg-brand-50 px-3 py-1 text-[13px] font-semibold text-primary">{q.official_unit_name || q.official_subject_name}</span>
            )}
            <p className="mt-5 text-[14px] text-muted-foreground">Answer aloud as if you are speaking to the examiner.</p>
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => setI((n) => n - 1)}
                className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-4 text-[14px] font-semibold text-slate-700 hover:border-primary hover:text-primary disabled:opacity-40 dark:text-slate-300"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              {i < questions.length - 1 ? (
                <button type="button" onClick={() => setI((n) => n + 1)} className="inline-flex h-10 items-center gap-1 rounded-lg bg-primary px-4 text-[14px] font-semibold text-primary-foreground hover:opacity-90">
                  Next question <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <span className="text-[14px] font-semibold text-muted-foreground">Last question</span>
              )}
            </div>
          </article>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={x.busy}
              onClick={() => {
                if (confirm("Submit this viva now? The timer stops and the answer key unlocks.")) void x.submit();
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-5 text-[14px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Submit Viva
            </button>
          </div>
        </section>
      )}

      {x.error && <p className="rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger">{x.error}</p>}

      {x.phase === "done" && (
        <>
          <div className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success-soft p-5">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <p className="text-[14px] text-foreground">
              <strong className="font-bold">Viva answer key unlocked.</strong> Compare your answers with each model answer and key point.
            </p>
          </div>
          {x.key ? <KeyList rows={x.key} /> : !x.error && <p className="text-[14px] text-muted-foreground">Loading the answer key…</p>}
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Award, BookOpenCheck, CheckCircle2, ChevronDown, Flame, History, Lightbulb, PencilRuler, Target } from "lucide-react";
import { questionTone } from "@/components/question-bank/question-tone";
import { MarkButtons } from "@/components/question-bank/pro/Progress";

/**
 * One Question Bank Pro question — the RGUHS NursingBankCard's design with
 * the source page's content: its number in the list, type · marks · unit ·
 * "Drawing Required", the options, and Show Answer opening the answer (with
 * the correct option for MCQs), rationale and exam tip. Most Important adds a
 * priority and a source; Previous Years how often and when it was asked.
 *
 * Answer bodies arrive as HTML already formatted and sanitised on the server
 * (lib/cns/qbank-pro-format) — nothing here builds markup from content.
 */
export interface ProQuestion {
  id: number | string;
  number: number;
  question: string;
  type?: string | null;
  marks?: number | string | null;
  unit?: string | null;
  subject?: string | null;
  drawing?: boolean;
  options?: [string, string][];
  correctOption?: string | null;
  answerHtml?: string | null;
  rationaleHtml?: string | null;
  tipHtml?: string | null;
  priority?: string | null;
  source?: string | null;
  timesAsked?: number | null;
  /** Previous Years: each exam sitting it was set in ("Apr 2014"); timesAsked is their number. */
  sittings?: string[];
  /** This member's Save / Done on the question (progress). */
  mark?: { saved: boolean; done: boolean };
}

const PRIORITY: Record<string, string> = {
  high: "bg-danger-soft text-danger ring-red-600/20",
  moderate: "bg-warning-soft text-warning ring-amber-600/20",
  low: "bg-success-soft text-success ring-emerald-600/20",
};

export function ProQuestionCard({ q }: { q: ProQuestion }) {
  const [open, setOpen] = useState(false);
  const tone = questionTone(q.type ?? null);
  const TypeIcon = tone.icon;
  const marks = q.marks == null || q.marks === "" ? null : Number(q.marks);
  const priorityKey = (q.priority ?? "").toLowerCase().replace(/\s*priority\s*/, "").trim();

  return (
    <article className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-[0_6px_20px_rgba(16,24,40,0.09)]">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${tone.rail}`} />

      <div className="flex gap-4 p-5 pl-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-[14px] font-bold tabular-nums text-primary-foreground">
          {q.number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {q.type && (
              <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-bold uppercase tracking-wider ring-1 ring-inset ${tone.badge}`}>
                <TypeIcon className="h-3.5 w-3.5" />
                {q.type}
              </span>
            )}
            {marks != null && !Number.isNaN(marks) && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[12px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                <Award className="h-3.5 w-3.5" />
                {marks} {marks === 1 ? "Mark" : "Marks"}
              </span>
            )}
            {q.drawing && (
              <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-[12px] font-semibold text-primary ring-1 ring-inset ring-primary/15">
                <PencilRuler className="h-3.5 w-3.5" />
                Drawing Required
              </span>
            )}
            {q.priority && (
              <span className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-bold ring-1 ring-inset ${PRIORITY[priorityKey] ?? PRIORITY.moderate}`}>
                <Flame className="h-3.5 w-3.5" />
                {q.priority}
              </span>
            )}
          </div>

          {(q.subject || q.unit) && (
            <p className="mt-3 text-[13.5px] font-medium leading-snug text-slate-600 dark:text-slate-400">
              {[q.subject, q.unit].filter(Boolean).join(" · ")}
            </p>
          )}

          <p className="mt-1.5 max-w-[78ch] whitespace-pre-wrap text-[16.5px] font-semibold leading-[1.6] tracking-[-0.005em] text-foreground">
            {q.question}
          </p>

          {q.source && (
            <p className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-primary dark:text-blue-300">
              <BookOpenCheck className="h-3.5 w-3.5" />
              {q.source}
            </p>
          )}

          {q.options && q.options.length > 0 && (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {q.options.map(([letter, text]) => (
                <li key={letter} className="rounded-lg border border-border/70 bg-background/60 px-3 py-2.5 text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
                  <span className="font-bold text-primary dark:text-blue-300">{letter}.</span> {text}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={`answer-${q.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[14px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {open ? "Hide Answer" : "Show Answer"}
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {q.mark && <MarkButtons kind="q" item={Number(q.id)} saved={q.mark.saved} done={q.mark.done} />}
          </div>
        </div>

        {/* Previous Years: how often it was set, as a highlighted panel on the
            right. The count is the number of sittings listed beside it. */}
        {!!q.timesAsked && (
          <aside className="hidden w-48 shrink-0 self-start rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 sm:block dark:border-amber-400/25 dark:bg-amber-500/10">
            <AskedPanel times={q.timesAsked} sittings={q.sittings ?? []} />
          </aside>
        )}
      </div>

      {!!q.timesAsked && (
        <div className="mx-5 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 sm:hidden dark:border-amber-400/25 dark:bg-amber-500/10">
          <AskedPanel times={q.timesAsked} sittings={q.sittings ?? []} />
        </div>
      )}

      {open && (
        <div id={`answer-${q.id}`} className="space-y-4 border-t border-border bg-background/70 px-5 py-4 sm:pl-[4.25rem]">
          {q.correctOption && (
            <p className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[15.5px] font-bold text-primary dark:text-blue-300">
                <CheckCircle2 className="h-[18px] w-[18px]" />
                Correct option:
              </span>
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-emerald-50 px-2.5 text-[16px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25">
                {q.correctOption}
              </span>
            </p>
          )}
          <AnswerSection icon={BookOpenCheck} label="Answer" html={q.answerHtml ?? "<p>Answer not available.</p>"} />
          {q.rationaleHtml && <AnswerSection icon={Lightbulb} label="Rationale" html={q.rationaleHtml} />}
          {q.tipHtml && <AnswerSection icon={Target} label="Exam Tip" html={q.tipHtml} />}
        </div>
      )}
    </article>
  );
}

function AskedPanel({ times, sittings }: { times: number; sittings: string[] }) {
  return (
    <>
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-amber-900 dark:text-amber-200" title={`Asked ${times} ${times === 1 ? "time" : "times"} in RGUHS exams`}>
        <History className="h-3.5 w-3.5 shrink-0" />
        Asked <span className="tabular-nums">{times}×</span>
        <span className="font-medium text-amber-800/80 dark:text-amber-300/80">in RGUHS exams</span>
      </p>
      {sittings.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {sittings.map((s) => (
            <li key={s} className="rounded bg-white px-1.5 text-[11.5px] font-semibold leading-5 tabular-nums text-amber-900 ring-1 ring-inset ring-amber-300 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-400/30">
              {s}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AnswerSection({ icon: Icon, label, html }: { icon: typeof Target; label: string; html: string }) {
  return (
    <div className="border-l-[3px] border-primary/30 pl-3.5">
      <p className="flex items-center gap-1.5 text-[15.5px] font-bold text-primary dark:text-blue-300">
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {label}
      </p>
      <AnswerHtml html={html} />
    </div>
  );
}

/** Server-sanitised answer markup, styled like the RGUHS answer body. */
export function AnswerHtml({ html }: { html: string }) {
  return (
    <div
      className="qb-answer mt-1.5 max-w-[78ch] text-[16px] font-medium leading-[1.7] text-slate-800 dark:text-slate-200 [&_.qb-heading]:mt-3 [&_.qb-heading]:font-bold [&_.qb-heading]:text-primary dark:[&_.qb-heading]:text-blue-300 [&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p+p]:mt-2 [&_p]:mt-1 [&_strong]:font-bold [&_strong]:text-foreground [&_table]:mt-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

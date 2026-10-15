"use client";

import { useState } from "react";
import { Award, BookOpenCheck, CheckCircle2, ChevronDown, Flame, History, Lightbulb, PencilRuler, Target } from "lucide-react";
import { questionTone } from "@/components/question-bank/question-tone";

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
  years?: string[];
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

          {(q.source || q.timesAsked) && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold text-primary dark:text-blue-300">
              {q.source && (
                <span className="inline-flex items-center gap-1">
                  <BookOpenCheck className="h-3.5 w-3.5" />
                  {q.source}
                </span>
              )}
              {!!q.timesAsked && (
                <span className="inline-flex items-center gap-1">
                  <History className="h-3.5 w-3.5" />
                  Asked {q.timesAsked} {q.timesAsked === 1 ? "time" : "times"}
                  {q.years && q.years.length > 0 && <span className="font-medium text-slate-600 dark:text-slate-400"> · {q.years.join(", ")}</span>}
                </span>
              )}
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

          <div className="mt-4">
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
          </div>
        </div>
      </div>

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

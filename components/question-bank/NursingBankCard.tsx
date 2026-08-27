"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import {
  ANSWER_LABELS_INLINE,
  QUESTION_LIST_COPY,
  marksLabel,
  metaChain,
} from "@/lib/cns/question-bank-content";

/**
 * One question in the Nursing Bank list.
 *
 * Wording is fixed by lib/cns/question-bank-content.ts and must match
 * unnhub.org/nursingbank exactly — "Answer:" with its colon, "1 marks" without
 * singularising. Only the arrangement is ours: the marks pill is lifted out of
 * the ` · ` chain into the header row so a reader can weigh a question before
 * reading it, and the chain keeps subject · unit · topic verbatim.
 *
 * Contrast: the theme's muted-foreground (#6b7280) sits at ~4.8:1 on a white
 * card, which is legible for body copy but not for 12px metadata. Secondary
 * text here is slate-600/slate-400 instead, with explicit dark variants —
 * globals.css only overrides the bare `.text-muted-foreground` class, so an
 * opacity modifier on a token would go unstyled in dark mode.
 */

/** Type families, so a reader can scan by question shape without reading labels. */
function typeTone(type: string | null): string {
  const t = (type ?? "").toLowerCase();
  if (t.includes("mcq"))
    return "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/25";
  if (t.includes("essay") || t.includes("answer") || t.includes("difference"))
    return "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/25";
  if (t.includes("viva") || t.includes("practical") || t.includes("procedure"))
    return "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25";
  if (t.includes("scenario") || t.includes("case") || t.includes("study"))
    return "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25";
  if (t.includes("diagram") || t.includes("flowchart") || t.includes("chart"))
    return "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25";
  if (t.includes("care plan") || t.includes("drug") || t.includes("health education"))
    return "bg-cyan-50 text-cyan-800 ring-cyan-600/20 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/25";
  return "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/25";
}

export function NursingBankCard({
  id,
  href,
  stem,
  modelAnswer,
  rationale,
  examTip,
  diagramNote,
  type,
  marks,
  subjectName,
  unitName,
  topicName,
  optionA,
  optionB,
  optionC,
  optionD,
  correctOption,
}: {
  id: string;
  href: string;
  stem: string;
  modelAnswer: string | null;
  rationale: string | null;
  examTip: string | null;
  diagramNote?: string | null;
  type: string | null;
  marks: number | null;
  subjectName?: string | null;
  unitName?: string | null;
  topicName?: string | null;
  optionA?: string | null;
  optionB?: string | null;
  optionC?: string | null;
  optionD?: string | null;
  correctOption?: string | null;
}) {
  const [open, setOpen] = useState(false);

  const meta = metaChain([subjectName, unitName, topicName]);
  const options = ([["A", optionA], ["B", optionB], ["C", optionC], ["D", optionD]] as const).filter(
    ([, v]) => v
  ) as [string, string][];

  return (
    <article className="group rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-[0_4px_16px_rgba(16,24,40,0.08)]">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          {type && (
            <span
              className={`inline-flex shrink-0 items-center rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${typeTone(type)}`}
            >
              {type}
            </span>
          )}
          {marks != null && (
            <span className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-300">
              {marksLabel(marks)}
            </span>
          )}
        </div>

        {meta && (
          <p className="mt-3 text-[13px] font-medium leading-snug text-slate-600 dark:text-slate-400">
            {meta}
          </p>
        )}

        <p className="mt-2 whitespace-pre-wrap text-[15px] font-semibold leading-relaxed text-foreground">
          {stem}
        </p>

        {options.length > 0 && (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {options.map(([letter, text]) => (
              <li
                key={letter}
                className="rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-[13px] leading-relaxed text-slate-700 dark:text-slate-300"
              >
                {/* "A. " with its period, exactly as the source renders an option. */}
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
            aria-controls={`answer-${id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {QUESTION_LIST_COPY.showAnswer}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
          <Link
            href={href}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-4 text-[13px] font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary dark:text-slate-300"
          >
            {QUESTION_LIST_COPY.openFull}
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {open && (
        <div
          id={`answer-${id}`}
          className="space-y-4 border-t border-border bg-background/70 px-5 py-4"
        >
          {correctOption && (
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold text-primary dark:text-blue-300">
                {ANSWER_LABELS_INLINE.correctOption}
              </span>
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-emerald-50 px-2 text-[13px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25">
                {correctOption}
              </span>
            </p>
          )}
          {modelAnswer && <Section label={ANSWER_LABELS_INLINE.answer} body={modelAnswer} />}
          {rationale && <Section label={ANSWER_LABELS_INLINE.rationale} body={rationale} />}
          {examTip && <Section label={ANSWER_LABELS_INLINE.examTip} body={examTip} />}
          {diagramNote && <Section label="Diagram:" body={diagramNote} />}
        </div>
      )}
    </article>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <div className="border-l-2 border-primary/25 pl-3">
      <p className="text-[13px] font-bold text-primary dark:text-blue-300">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300">
        {body}
      </p>
    </div>
  );
}

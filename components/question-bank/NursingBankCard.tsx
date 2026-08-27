"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Award,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Lightbulb,
  Shapes,
  Target,
  type LucideIcon,
} from "lucide-react";
import { questionTone } from "@/components/question-bank/question-tone";
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

  const tone = questionTone(type);
  const TypeIcon = tone.icon;
  const meta = metaChain([subjectName, unitName, topicName]);
  const options = ([["A", optionA], ["B", optionB], ["C", optionC], ["D", optionD]] as const).filter(
    ([, v]) => v
  ) as [string, string][];

  return (
    <article className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-[0_6px_20px_rgba(16,24,40,0.09)]">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${tone.rail}`} />

      <div className="p-5 pl-6">
        <div className="flex flex-wrap items-center gap-2">
          {type && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset ${tone.badge}`}
            >
              <TypeIcon className="h-3.5 w-3.5" />
              {type}
            </span>
          )}
          {marks != null && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
              <Award className="h-3.5 w-3.5" />
              {marksLabel(marks)}
            </span>
          )}
        </div>

        {meta && (
          <p className="mt-3 text-[12.5px] font-medium leading-snug text-slate-600 dark:text-slate-400">
            {meta}
          </p>
        )}

        {/* Capped independently of the card: the container is wide so the
            filters and option grid have room, but a stem running the full
            width would be well past a readable measure. */}
        <p className="mt-1.5 max-w-[78ch] whitespace-pre-wrap text-[15.5px] font-semibold leading-[1.6] tracking-[-0.005em] text-foreground">
          {stem}
        </p>

        {options.length > 0 && (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {options.map(([letter, text]) => (
              <li
                key={letter}
                className="rounded-lg border border-border/70 bg-background/60 px-3 py-2.5 text-[14px] leading-relaxed text-slate-800 dark:text-slate-200"
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
              <span className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-primary dark:text-blue-300">
                <CheckCircle2 className="h-[18px] w-[18px]" />
                {ANSWER_LABELS_INLINE.correctOption}
              </span>
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-emerald-50 px-2.5 text-[15px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25">
                {correctOption}
              </span>
            </p>
          )}
          {modelAnswer && (
            <Section icon={BookOpenCheck} label={ANSWER_LABELS_INLINE.answer} body={modelAnswer} />
          )}
          {rationale && (
            <Section icon={Lightbulb} label={ANSWER_LABELS_INLINE.rationale} body={rationale} />
          )}
          {examTip && <Section icon={Target} label={ANSWER_LABELS_INLINE.examTip} body={examTip} />}
          {diagramNote && <Section icon={Shapes} label="Diagram:" body={diagramNote} />}
        </div>
      )}
    </article>
  );
}

function Section({
  icon: Icon,
  label,
  body,
}: {
  icon: LucideIcon;
  label: string;
  body: string;
}) {
  return (
    <div className="border-l-[3px] border-primary/30 pl-3.5">
      <p className="flex items-center gap-1.5 text-[14.5px] font-bold text-primary dark:text-blue-300">
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {label}
      </p>
      {/* The answer is what the reader came for — set at the same size as the
          question rather than as fine print under it. */}
      <p className="mt-1.5 max-w-[78ch] whitespace-pre-wrap text-[15px] font-medium leading-[1.7] text-slate-800 dark:text-slate-200">
        {body}
      </p>
    </div>
  );
}

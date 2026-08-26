"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ANSWER_LABELS_INLINE,
  QUESTION_LIST_COPY,
  marksLabel,
  metaChain,
} from "@/lib/cns/question-bank-content";

/**
 * One question in the Nursing Bank list, rendered with the legacy site's
 * wording exactly.
 *
 * Deliberately NOT StudyCard. That component says "Model answer" and
 * singularises to "1 mark"; this tree must read "Answer:" and "1 marks" to
 * match unnhub.org/nursingbank. Editing StudyCard to suit would have changed
 * the existing descriptive pages that already use it.
 *
 * Every label comes from lib/cns/question-bank-content.ts — none are typed
 * here, so the wording has exactly one source.
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

  // subject · unit · topic · N marks — the source's order, empty parts dropped.
  const meta = metaChain([
    subjectName,
    unitName,
    topicName,
    marks != null ? marksLabel(marks) : null,
  ]);

  const options = [
    ["A", optionA],
    ["B", optionB],
    ["C", optionC],
    ["D", optionD],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      {type && (
        <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-primary">
          {type}
        </span>
      )}

      {meta && <p className="mt-2 text-xs text-muted-foreground">{meta}</p>}

      <p className="mt-2 whitespace-pre-wrap font-medium leading-relaxed">{stem}</p>

      {options.length > 0 && (
        <ul className="mt-3 space-y-2">
          {options.map(([letter, text]) => (
            <li key={letter} className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
              {letter}. {text}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={`answer-${id}`}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {QUESTION_LIST_COPY.showAnswer}
        </button>
        <Link
          href={href}
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
        >
          {QUESTION_LIST_COPY.openFull}
        </Link>
      </div>

      {open && (
        <div id={`answer-${id}`} className="mt-4 space-y-3 rounded-lg bg-muted/50 p-4">
          {correctOption && (
            <p className="text-sm">
              <span className="font-semibold text-primary">
                {ANSWER_LABELS_INLINE.correctOption}
              </span>{" "}
              {correctOption}
            </p>
          )}
          {modelAnswer && <Section label={ANSWER_LABELS_INLINE.answer} body={modelAnswer} />}
          {rationale && <Section label={ANSWER_LABELS_INLINE.rationale} body={rationale} />}
          {examTip && <Section label={ANSWER_LABELS_INLINE.examTip} body={examTip} />}
          {diagramNote && <Section label="Diagram:" body={diagramNote} />}
        </div>
      )}
    </div>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-primary">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
    </div>
  );
}

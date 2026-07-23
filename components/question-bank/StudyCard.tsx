"use client";

import { useState } from "react";
import { ChevronDown, Lightbulb, Eye, PenLine } from "lucide-react";

/**
 * One revision question: the stem always shown, the model answer revealed on
 * demand. Self-assessment, not grading — the learner reads the question, tries
 * it in their head or on paper, then reveals the model answer to check.
 */
export function StudyCard({
  stem,
  modelAnswer,
  rationale,
  examTip,
  diagramNote,
  type,
  marks,
}: {
  stem: string;
  modelAnswer: string | null;
  rationale: string | null;
  examTip: string | null;
  diagramNote?: string | null;
  type: string | null;
  marks: number | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {type && <span className="rounded bg-muted px-2 py-0.5 font-medium">{type}</span>}
        {marks != null && <span>{marks} {marks === 1 ? "mark" : "marks"}</span>}
      </div>

      <p className="whitespace-pre-wrap font-medium">{stem}</p>

      {open ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {modelAnswer && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Model answer
              </p>
              <p className="whitespace-pre-wrap text-sm">{modelAnswer}</p>
            </div>
          )}
          {rationale && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rationale</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{rationale}</p>
            </div>
          )}
          {diagramNote && (
            <p className="flex items-start gap-1.5 rounded-md border border-border bg-muted/40 p-3 text-sm">
              <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="font-medium">Diagram to draw: </span>
                {diagramNote}
              </span>
            </p>
          )}
          {examTip && (
            <p className="flex items-start gap-1.5 rounded-md bg-primary/5 p-3 text-sm">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{examTip}</span>
            </p>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Eye className="h-4 w-4" /> Reveal model answer
        </button>
      )}

      {open && (
        <button
          onClick={() => setOpen(false)}
          className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ChevronDown className="h-3.5 w-3.5 rotate-180" /> Hide
        </button>
      )}
    </div>
  );
}

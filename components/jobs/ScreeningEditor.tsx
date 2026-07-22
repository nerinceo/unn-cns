"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setScreeningQuestions } from "@/lib/actions/jobs";

export type Question = {
  question: string;
  question_type: "short_answer" | "yes_no";
  is_required: boolean;
};

const MAX = 5;

/**
 * Screening questions (blueprint §7.3 — up to five, short answer or yes/no).
 *
 * Saved explicitly rather than on every keystroke: changing these rewrites the
 * whole set, so an autosave mid-typing would churn the table and briefly leave
 * a half-typed question live on the apply form.
 */
export function ScreeningEditor({
  jobId,
  initial,
}: {
  jobId: string;
  initial: Question[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<Question[]>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(i: number, next: Partial<Question>) {
    setItems((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...next } : q)));
    setSaved(false);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="font-medium">Screening questions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Up to {MAX}. Applicants answer these when they apply — keep them short and specific.
        </p>
      </div>

      {items.length === 0 && (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          No questions. Applicants will simply send their profile and CV.
        </p>
      )}

      {items.map((q, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border p-3">
          <Input
            value={q.question}
            onChange={(e) => patch(i, { question: e.target.value })}
            placeholder="e.g. Do you hold a valid licence in this country?"
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Answer type
              <select
                value={q.question_type}
                onChange={(e) =>
                  patch(i, { question_type: e.target.value as Question["question_type"] })
                }
                className="h-8 rounded-md border border-border bg-card px-2 text-xs"
              >
                <option value="short_answer">Short answer</option>
                <option value="yes_no">Yes / No</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={q.is_required}
                onChange={(e) => patch(i, { is_required: e.target.checked })}
              />
              Required
            </label>
            <button
              onClick={() => {
                setItems((prev) => prev.filter((_, idx) => idx !== i));
                setSaved(false);
              }}
              aria-label="Remove question"
              className="ml-auto rounded p-1.5 text-muted-foreground hover:text-secondary"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          variant="outline"
          size="sm"
          disabled={items.length >= MAX}
          onClick={() => {
            setItems((p) => [...p, { question: "", question_type: "short_answer", is_required: false }]);
            setSaved(false);
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add question
        </Button>

        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await setScreeningQuestions(jobId, items);
              if (res?.error) setError(res.error);
              else {
                setSaved(true);
                router.refresh();
              }
            })
          }
        >
          {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Save questions
        </Button>

        {saved && (
          <span className="flex items-center gap-1 text-xs text-primary">
            <Check className="h-3 w-3" /> Saved
          </span>
        )}
        {items.length >= MAX && (
          <span className="text-xs text-muted-foreground">Maximum of {MAX} reached.</span>
        )}
      </div>

      {error && <p className="text-sm text-secondary">{error}</p>}
    </div>
  );
}

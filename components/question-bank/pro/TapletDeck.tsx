"use client";

import { useState } from "react";
import { CheckCircle2, Eye, XCircle } from "lucide-react";
import type { TapletTask } from "@/lib/cns/qbank-pro";

/**
 * Practice Taplets (nerusalem.in practice-taplets/papers/qpNNNN.html): quick
 * interactive cards. Choice cards (MCQ, Clinical Case, 30-second Challenge,
 * True or False) are answered by tapping an option; recall cards (Fill the
 * Blank, Flip & Recall) by revealing the answer. Each answered card shows its
 * explanation and counts towards the paper's progress. Progress lives on this
 * page only, as on the source.
 */

/** Card tints cycle through the CNS palette, as the source cycled its own. */
const TINTS = [
  "bg-brand-50 ring-primary/10",
  "bg-emerald-50/70 ring-emerald-600/10 dark:bg-emerald-500/5",
  "bg-amber-50/70 ring-amber-600/10 dark:bg-amber-500/5",
  "bg-violet-50/70 ring-violet-600/10 dark:bg-violet-500/5",
];

function optionsOf(t: TapletTask): string[] | null {
  if (t.options && t.options.length) return t.options;
  if (t.kind === "True or False") return ["True", "False"];
  return null;
}

export function TapletDeck({ tasks }: { tasks: TapletTask[] }) {
  const [state, setState] = useState<Record<number, { picked?: number; revealed?: boolean }>>({});
  const done = Object.keys(state).length;

  return (
    <div className="space-y-5">
      <div>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} />
        </div>
        <p className="mt-2 text-[14px] font-semibold tabular-nums text-slate-700 dark:text-slate-300">
          {done} / {tasks.length} completed
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {tasks.map((t, i) => {
          const s = state[i] ?? {};
          const opts = optionsOf(t);
          const answered = s.picked != null || s.revealed;
          const right = s.picked != null && t.correct != null ? s.picked === t.correct : null;
          return (
            <article key={i} className={`flex flex-col rounded-2xl p-5 ring-1 ring-inset ${TINTS[i % TINTS.length]}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-card px-2.5 py-0.5 text-[12px] font-bold text-primary ring-1 ring-inset ring-primary/15">{t.kind}</span>
                <span className="text-[12.5px] font-semibold tabular-nums text-muted-foreground">
                  {i + 1} / {tasks.length}
                </span>
              </div>
              <h3 className="mt-3 text-[16.5px] font-bold leading-snug text-foreground">{t.q}</h3>

              {opts ? (
                <div className="mt-4 grid gap-2">
                  {opts.map((o, k) => {
                    const isCorrect = t.correct === k;
                    const picked = s.picked === k;
                    const cls = !answered
                      ? "border-border bg-card hover:border-primary hover:text-primary"
                      : isCorrect
                        ? "border-success bg-success-soft text-success"
                        : picked
                          ? "border-danger bg-danger-soft text-danger"
                          : "border-border bg-card opacity-60";
                    return (
                      <button
                        key={k}
                        type="button"
                        disabled={answered}
                        onClick={() => setState((x) => ({ ...x, [i]: { picked: k } }))}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5 text-left text-[15px] font-semibold transition-colors ${cls}`}
                      >
                        {o}
                        {answered && isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                        {answered && picked && !isCorrect && <XCircle className="h-4 w-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ) : !s.revealed ? (
                <button
                  type="button"
                  onClick={() => setState((x) => ({ ...x, [i]: { revealed: true } }))}
                  className="mt-4 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[14px] font-semibold text-primary-foreground hover:opacity-90"
                >
                  <Eye className="h-4 w-4" /> {t.kind === "Flip & Recall" ? "Flip card" : "Reveal answer"}
                </button>
              ) : (
                <p className="mt-4 rounded-lg border border-success bg-success-soft px-3.5 py-2.5 text-[15px] font-bold text-success">{t.answer}</p>
              )}

              {answered && (
                <div className="mt-3 rounded-lg bg-card/80 p-3 text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
                  {right === false && (
                    <p className="mb-1 font-bold text-danger">
                      Answer: <span className="text-success">{t.answer}</span>
                    </p>
                  )}
                  {right === true && <p className="mb-1 font-bold text-success">Correct!</p>}
                  {t.explanation}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

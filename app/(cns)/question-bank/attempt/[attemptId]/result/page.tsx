import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, X, Minus, ArrowLeft } from "lucide-react";
import {
  getAttempt,
  getAttemptResponses,
  getQuestionsByIds,
  getQuestionSet,
} from "@/lib/cns/question-bank";
import { getAttemptReview } from "@/lib/actions/attempts";
import { cn } from "@/lib/utils/cn";

export const dynamic = "force-dynamic";

export default async function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;

  const attempt = await getAttempt(attemptId);
  if (!attempt) notFound();
  if (attempt.status !== "submitted") redirect(`/question-bank/attempt/${attemptId}`);

  const [questions, responses, set, review] = await Promise.all([
    getQuestionsByIds((attempt.question_ids as string[]) ?? []),
    getAttemptResponses(attemptId),
    attempt.set_id ? getQuestionSet(attempt.set_id as string) : Promise.resolve(null),
    // The ONLY route by which the answer key reaches this app — a definer
    // function that re-checks ownership and that the attempt is submitted.
    getAttemptReview(attemptId),
  ]);

  const score = Number(attempt.score ?? 0);
  const maxScore = Number(attempt.max_score ?? 0);
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const passed = set?.pass_percentage != null ? pct >= Number(set.pass_percentage) : null;

  const respByQ = new Map(responses.map((r) => [r.question_id as string, r]));
  const revByQ = new Map(review.rows.map((r) => [r.question_id, r]));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href="/question-bank"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Question Bank
      </Link>

      {/* score ----------------------------------------------------------- */}
      <section className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">{set?.title ?? "Practice"}</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-4xl font-semibold tabular-nums">
            {score}
            <span className="text-xl text-muted-foreground"> / {maxScore}</span>
          </span>
          <span className="text-lg text-muted-foreground tabular-nums">{pct}%</span>
          {passed !== null && (
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-sm font-medium",
                passed ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
              )}
            >
              {passed ? "Passed" : "Not passed"}
            </span>
          )}
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Correct</dt>
            <dd className="mt-0.5 text-lg font-medium text-primary tabular-nums">
              {attempt.correct_count as number}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Wrong</dt>
            <dd className="mt-0.5 text-lg font-medium text-secondary tabular-nums">
              {attempt.wrong_count as number}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Skipped</dt>
            <dd className="mt-0.5 text-lg font-medium text-muted-foreground tabular-nums">
              {attempt.skipped_count as number}
            </dd>
          </div>
        </dl>
      </section>

      {/* review ---------------------------------------------------------- */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Review
        </h2>

        {review.rows.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
            Answers are not available for this set.
          </p>
        ) : (
          questions.map((q, i) => {
            const resp = respByQ.get(q.id);
            const rev = revByQ.get(q.id);
            const selected = (resp?.selected_option_ids as string[]) ?? [];
            const correctIds = rev?.correct_option_ids ?? [];
            const answered = selected.length > 0 || Boolean(resp?.answer_text);
            const isCorrect = rev?.is_correct;

            return (
              <article key={q.id} className="rounded-lg border border-border bg-card p-5">
                <div className="mb-3 flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                      !answered
                        ? "bg-muted text-muted-foreground"
                        : isCorrect
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                    )}
                  >
                    {!answered ? (
                      <Minus className="h-3.5 w-3.5" />
                    ) : isCorrect ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      Question {i + 1} · {Number(rev?.marks_awarded ?? 0) > 0 ? "+" : ""}
                      {rev?.marks_awarded ?? 0} marks
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{q.stem}</p>
                  </div>
                </div>

                {q.options.length > 0 ? (
                  <ul className="ml-9 space-y-1.5">
                    {q.options.map((opt) => {
                      const isRight = correctIds.includes(opt.id);
                      const chose = selected.includes(opt.id);
                      return (
                        <li
                          key={opt.id}
                          className={cn(
                            "flex items-center gap-2 rounded px-2.5 py-1.5 text-sm",
                            isRight && "bg-primary/10 font-medium text-primary",
                            chose && !isRight && "bg-secondary/10 text-secondary line-through"
                          )}
                        >
                          {isRight ? (
                            <Check className="h-3.5 w-3.5 shrink-0" />
                          ) : chose ? (
                            <X className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <span className="w-3.5" />
                          )}
                          {opt.option_text}
                          {chose && <span className="ml-auto text-xs opacity-70">your answer</span>}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="ml-9 space-y-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">Your answer: </span>
                      {resp?.answer_text || <em className="text-muted-foreground">skipped</em>}
                    </p>
                    {(() => {
                      const accepted = (rev?.answer_key as { accepted?: string[] } | null)?.accepted;
                      return accepted?.length ? (
                        <p>
                          <span className="text-muted-foreground">Accepted: </span>
                          <span className="font-medium text-primary">{accepted.join(", ")}</span>
                        </p>
                      ) : null;
                    })()}
                  </div>
                )}

                {rev?.explanation && (
                  <p className="ml-9 mt-3 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                    {rev.explanation}
                  </p>
                )}
              </article>
            );
          })
        )}
      </section>

      <Link
        href={`/question-bank/set/${attempt.set_id}`}
        className="inline-block text-sm text-primary hover:underline"
      >
        Retake this set
      </Link>
    </div>
  );
}

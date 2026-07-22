import { notFound, redirect } from "next/navigation";
import {
  getAttempt,
  getAttemptResponses,
  getQuestionsByIds,
  getQuestionSet,
} from "@/lib/cns/question-bank";
import { AttemptRunner } from "@/components/question-bank/AttemptRunner";

export const dynamic = "force-dynamic";

export default async function AttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;

  // RLS scopes cns_attempts to the caller, so someone else's id simply reads
  // as null here — no separate ownership check needed.
  const attempt = await getAttempt(attemptId);
  if (!attempt) notFound();

  if (attempt.status === "submitted") {
    redirect(`/question-bank/attempt/${attemptId}/result`);
  }

  const [questions, responses, set] = await Promise.all([
    getQuestionsByIds((attempt.question_ids as string[]) ?? []),
    getAttemptResponses(attemptId),
    attempt.set_id ? getQuestionSet(attempt.set_id as string) : Promise.resolve(null),
  ]);

  if (!questions.length) notFound();

  const initial = Object.fromEntries(
    responses.map((r) => [
      r.question_id as string,
      {
        selected: (r.selected_option_ids as string[]) ?? [],
        text: (r.answer_text as string) ?? "",
        flagged: Boolean(r.flagged),
      },
    ])
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-lg font-medium">{set?.title ?? "Practice"}</h1>
      <AttemptRunner
        attemptId={attemptId}
        questions={questions}
        initial={initial}
        durationMinutes={set?.duration_minutes ?? null}
        startedAt={attempt.started_at as string}
      />
    </div>
  );
}

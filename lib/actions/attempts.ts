"use server";


import type { ActionResult } from "@/lib/actions/result";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getQuestionSet, getSetQuestionIds } from "@/lib/cns/question-bank";

/**
 * Attempt lifecycle.
 *
 * Grading deliberately does NOT happen here — it runs in the SECURITY DEFINER
 * function cns_submit_attempt(), because the answer columns are unreadable from
 * application code by design. Scoring in JS would require exposing the key to
 * the server session, and from there it inevitably leaks to the client.
 */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function startAttempt(setId: string): Promise<ActionResult & { attemptId?: string; resumed?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  const set = await getQuestionSet(setId);
  if (!set) return { error: "Set not found" };

  const supabase = await createClient();

  // Resume rather than start a duplicate. Losing 20 minutes of answers to an
  // accidental second click would be inexcusable.
  const { data: existing } = await supabase
    .from("cns_attempts")
    .select("id")
    .eq("set_id", setId)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return { attemptId: existing.id as string, resumed: true };

  let ids = await getSetQuestionIds(setId);
  if (!ids.length) return { error: "This set has no questions yet" };
  if (set.shuffle_questions) ids = shuffle(ids);

  const { data, error } = await supabase
    .from("cns_attempts")
    .insert({
      user_id: user.id,
      set_id: setId,
      subject_id: set.subject_id,
      mode: set.duration_minutes ? "timed" : "practice",
      status: "in_progress",
      // Frozen here so editing the set mid-attempt cannot change what the
      // learner is answering.
      question_ids: ids,
      total_questions: ids.length,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { attemptId: data.id as string, resumed: false };
}

/**
 * Upsert one answer. Called on every change, so the runner survives a reload
 * or a dropped connection without losing progress.
 */
export async function saveResponse(
  attemptId: string,
  questionId: string,
  payload: { selectedOptionIds?: string[]; answerText?: string; flagged?: boolean; timeSpent?: number }
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.from("cns_attempt_responses").upsert(
    {
      attempt_id: attemptId,
      question_id: questionId,
      selected_option_ids: payload.selectedOptionIds ?? [],
      answer_text: payload.answerText ?? null,
      flagged: payload.flagged ?? false,
      time_spent_seconds: payload.timeSpent ?? 0,
      answered_at: new Date().toISOString(),
    },
    { onConflict: "attempt_id,question_id" }
  );

  // RLS enforces that the attempt is the caller's own AND still in_progress,
  // so a submitted attempt cannot be edited after the fact.
  if (error) return { error: error.message };
  return { ok: true };
}

export async function submitAttempt(attemptId: string): Promise<ActionResult> {
  const supabase = await createClient();

  // All scoring, progress rollup and item statistics happen inside this one
  // function. It re-checks ownership itself, so a forged attemptId fails there.
  const { error } = await supabase.rpc("cns_submit_attempt", { p_attempt_id: attemptId });
  if (error) return { error: error.message };

  revalidatePath(`/question-bank/attempt/${attemptId}`);
  revalidatePath("/progress");
  return { ok: true };
}

/** Answer key + explanations. Only returns for a submitted attempt you own. */
export async function getAttemptReview(attemptId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cns_attempt_review", { p_attempt_id: attemptId });
  if (error) return { error: error.message, rows: [] };
  return {
    rows: (data ?? []) as {
      question_id: string;
      correct_option_ids: string[];
      answer_key: unknown;
      explanation: string | null;
      is_correct: boolean | null;
      marks_awarded: number;
    }[],
  };
}

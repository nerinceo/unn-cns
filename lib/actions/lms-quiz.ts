"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actionError } from "@/lib/errors";
import { all, optId, reqId } from "@/lib/validate";
import type { AttemptPayload, AttemptReview } from "@/lib/lms/quiz";

/**
 * UNN Learn — taking a quiz or exam.
 *
 * Thin by design. Every rule — enrolment, attempt limits, the retake wait, the
 * timer, which answers count, what the result reveals — lives in the database
 * functions of HUB migration 0076, because those are the only writers of the
 * attempt tables (they have no client write policy at all). This file validates
 * the shape of the request and relays the result; a learner calling the RPCs
 * directly gets exactly the same answers.
 *
 * Errors those functions raise are written for the learner and pass through
 * actionError() unchanged.
 */

export async function startQuizAttempt(
  lectureId: string,
): Promise<{ attempt: AttemptPayload } | { error: string }> {
  const id = reqId(lectureId, "Quiz");
  if (!id.ok) return { error: id.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lms_start_attempt", { p_lecture: id.value });
  if (error) return actionError("lms-quiz:startQuizAttempt", error, "Could not start the quiz.");
  return { attempt: data as AttemptPayload };
}

/**
 * Save one answer as it is chosen, so a closed tab or a dropped connection
 * loses nothing. `optionId` null clears the answer.
 */
export async function saveQuizAnswer(
  attemptId: string,
  questionId: string,
  optionId: string | null,
): Promise<{ ok: true } | { error: string }> {
  const v = all({
    attemptId: reqId(attemptId, "Attempt"),
    questionId: reqId(questionId, "Question"),
    optionId: optId(optionId, "Answer"),
  });
  if (!v.ok) return { error: v.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("lms_save_answer", {
    p_attempt: v.value.attemptId,
    p_question: v.value.questionId,
    p_option: v.value.optionId,
  });
  if (error) return actionError("lms-quiz:saveQuizAnswer", error, "Your answer wasn't saved. Try again.");
  return { ok: true };
}

/** Submit (also used when the timer runs out). Returns the graded result. */
export async function submitQuizAttempt(
  attemptId: string,
): Promise<{ review: AttemptReview } | { error: string }> {
  const id = reqId(attemptId, "Attempt");
  if (!id.ok) return { error: id.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lms_submit_attempt", { p_attempt: id.value });
  if (error) return actionError("lms-quiz:submitQuizAttempt", error, "Could not submit. Your answers are saved — try again.");

  // Passing can complete the lecture, the course and issue a certificate.
  revalidatePath("/lms");
  return { review: data as AttemptReview };
}

/** The result of an earlier attempt. */
export async function getQuizReview(
  attemptId: string,
): Promise<{ review: AttemptReview } | { error: string }> {
  const id = reqId(attemptId, "Attempt");
  if (!id.ok) return { error: id.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lms_attempt_review", { p_attempt: id.value });
  if (error) return actionError("lms-quiz:getQuizReview", error, "Could not load the result.");
  return { review: data as AttemptReview };
}

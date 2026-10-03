/**
 * One place that turns a failure into (a) a log line + Sentry event and
 * (b) a message that is safe to show a user.
 *
 * MIRRORED: identical copies live in unn-cns and unn-uhn. Edit all three.
 *
 * Rules:
 *  - Never return `error.message` from Supabase/Postgres/Stripe to the client.
 *    It leaks table, column and policy names, and reads like a crash.
 *  - Messages raised by OUR OWN SQL (`raise exception` → code P0001) are
 *    written for users, so they pass through unchanged.
 *  - Every failure that reaches `actionError()` is logged with its context.
 *
 * Monitoring: `logError()` is the single reporting point. Today it writes a
 * structured line to Vercel logs; to add Sentry later, install @sentry/nextjs
 * and call Sentry.captureException inside `logError()` — no call site changes.
 */

export const GENERIC_ERROR = "Something went wrong. Please try again.";

type ErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
  name?: string;
};

function asErrorLike(err: unknown): ErrorLike {
  if (err && typeof err === "object") return err as ErrorLike;
  if (typeof err === "string") return { message: err };
  return {};
}

/** A message that is safe to show a user, for any thrown or returned error. */
export function userMessage(err: unknown, fallback: string = GENERIC_ERROR): string {
  const e = asErrorLike(err);
  const code = e.code ?? "";
  const msg = (e.message ?? "").toLowerCase();

  // Our own `raise exception '...'` text — authored for users.
  if (code === "P0001" && e.message) return e.message;

  if (code === "23505") return "This already exists.";
  if (code === "23503") return "This is linked to something that no longer exists. Please refresh and try again.";
  if (code === "23514" || code === "23502" || code === "22P02" || code === "22001")
    return "Some of the details aren't valid. Please check and try again.";
  if (code === "42501" || code === "PGRST301" || msg.includes("row-level security") || msg.includes("permission denied"))
    return "You don't have permission to do that.";
  if (code === "PGRST116") return "We couldn't find that. It may have been removed.";
  if (code === "57014" || code === "53300" || e.status === 503 || e.status === 504 || msg.includes("timeout"))
    return "The service is busy right now. Please try again in a moment.";
  if (msg.includes("fetch failed") || msg.includes("network") || e.name === "AbortError")
    return "We couldn't reach the server. Check your connection and try again.";

  return fallback;
}

/** Log a failure with context — one greppable line per failure in Vercel logs. */
export function logError(context: string, err: unknown, extra?: Record<string, unknown>): void {
  const e = asErrorLike(err);
  try {
    console.error(
      `[error] ${context}`,
      JSON.stringify({
        code: e.code,
        message: e.message ?? (typeof err === "string" ? err : undefined),
        details: e.details,
        hint: e.hint,
        ...extra,
      })
    );
  } catch {
    // Logging must never break the request it is reporting on (e.g. a
    // circular `extra`). Fall back to the raw value.
    console.error(`[error] ${context}`, err);
  }
}

/** Log + return the `{ error }` shape server actions already use. */
export function actionError(
  context: string,
  err: unknown,
  fallback?: string,
  extra?: Record<string, unknown>
): { error: string } {
  logError(context, err, extra);
  return { error: userMessage(err, fallback) };
}

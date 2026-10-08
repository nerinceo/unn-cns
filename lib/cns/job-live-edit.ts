import { deadlinePassed } from "./job-constants";

/** A role the public has seen. Its content changes go through review. */
export const LIVE_STATUSES = ["active", "paused"];

/**
 * Fields an employer may change on a live role without review. None of them is
 * a claim the reviewer checks: when applications close, how many posts there
 * are, and the employer's own reference.
 */
/**
 * Everything a reviewer reads — the only keys staff may apply from
 * pending_changes. pending_changes is employer-writable, so an approval must
 * never forward a key outside this list (status, employer_id, published_at…).
 * Mirrors the column list frozen by cns_jobs_guard_status().
 */
export const REVIEWED_FIELDS = [
  "title", "description", "responsibilities", "qualifications",
  "employment_type", "nursing_role", "specialty", "work_setting",
  "experience_level", "is_remote", "work_mode",
  "country", "state", "city", "street_address", "postal_code",
  "experience_min_years", "qualification_required", "license_required",
  "language_requirements", "salary_min", "salary_max", "salary_currency",
  "salary_period", "salary_undisclosed", "salary_text",
  "apply_mode", "external_apply_url", "visa_sponsorship",
] as const;

/** The reviewable part of a pending_changes object; anything else is dropped. */
export function reviewablePending(pending: unknown): Record<string, unknown> {
  if (!pending || typeof pending !== "object" || Array.isArray(pending)) return {};
  const out: Record<string, unknown> = {};
  for (const k of REVIEWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(pending, k)) out[k] = (pending as Record<string, unknown>)[k];
  }
  return out;
}

export const INSTANT_FIELDS = new Set(["application_deadline", "vacancies", "internal_ref"]);

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null) ||
  // numeric columns come back as numbers or strings depending on the driver
  (a != null && b != null && typeof a !== "object" && String(a) === String(b));

/**
 * Split an edit of a live role into what applies now and what waits for review.
 *
 * Pending changes accumulate across saves, and a field edited back to its live
 * value drops out of them, so "pending" is always exactly the difference an
 * approver would apply.
 */
export function splitLiveEdit(
  current: Record<string, unknown>,
  edit: Record<string, unknown>
): { instant: Record<string, unknown>; pending: Record<string, unknown> | null } | { error: string } {
  const instant: Record<string, unknown> = {};
  const pending: Record<string, unknown> = reviewablePending(current.pending_changes);
  for (const [k, v] of Object.entries(edit)) {
    if (INSTANT_FIELDS.has(k)) {
      if (!same(v, current[k])) instant[k] = v;
    } else if (!(REVIEWED_FIELDS as readonly string[]).includes(k)) {
      // Not a content field (nothing the composer sends today): leave it alone.
      continue;
    } else if (same(v, current[k])) {
      delete pending[k];
    } else {
      pending[k] = v;
    }
  }
  if ("application_deadline" in instant && deadlinePassed(instant.application_deadline as string | null)) {
    return { error: "The application deadline has already passed. Choose today or a later date." };
  }
  if ("application_deadline" in instant && instant.application_deadline == null) {
    return { error: "A live role needs an application deadline." };
  }
  // The pair is checked against what will be live once the change is applied.
  const lo = ("salary_min" in pending ? pending.salary_min : current.salary_min) as number | null;
  const hi = ("salary_max" in pending ? pending.salary_max : current.salary_max) as number | null;
  if (lo != null && hi != null && Number(lo) > Number(hi)) {
    return { error: "“Salary from” cannot be more than “Salary to”." };
  }
  return { instant, pending: Object.keys(pending).length ? pending : null };
}


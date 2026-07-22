/**
 * The shape every server action returns.
 *
 * Deliberately one object with two optional fields rather than a discriminated
 * union of `{ok: true} | {error: string}`. The union reads better in theory,
 * but TypeScript then refuses `res.error` without an `"error" in res` guard at
 * every call site — and the moment a guard like `checkLimit` adds a new error
 * branch, every caller breaks at once. That happened here.
 *
 * The cost is that `{ok: true, error: "..."}` is representable. Callers test
 * `error` first, so an accidental both-set value fails closed.
 */
export type ActionResult = { ok?: boolean; error?: string };

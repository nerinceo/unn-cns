/**
 * Input validation for server actions and route handlers. One small module,
 * no dependencies, mirrored verbatim into CNS and UHN.
 *
 * RULES
 *   - STRICTLY NO EMPTY VALUES. A required field that is missing, empty or
 *     whitespace-only is refused. An optional field left blank becomes `null`
 *     — never "" — so the database never stores an empty string.
 *   - Everything is trimmed. Control characters (NUL, escape codes…) are
 *     removed; single-line fields also lose newlines and tabs.
 *   - Every text field has a maximum length (LIMITS below).
 *   - Ids are UUIDs; numbers are finite and in range; enums are a fixed list;
 *     dates are real calendar dates; URLs are http(s) only.
 *
 * SPEED
 *   Each check is one pass over its input with patterns compiled once at module
 *   load — no allocation beyond the trimmed string, no schema objects built per
 *   request. Validating a typical form costs microseconds, invisible next to a
 *   single database round trip. Validate BEFORE touching the database, so bad
 *   input is refused without spending a query on it.
 *
 * USAGE
 *   const title = reqText(formData.get("title"), "Title", LIMITS.title);
 *   if (!title.ok) return { error: title.error };
 *   ... title.value
 *
 *   or, several at once (first error wins):
 *   const v = all({ title: reqText(...), fee: optMoney(...) });
 *   if (!v.ok) return { error: v.error };
 *   v.value.title
 */

export type Valid<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };

const ok = <T>(value: T): Valid<T> => ({ ok: true, value });
const bad = (error: string): Valid<never> => ({ ok: false, error });

/** Maximum lengths, in characters. One place, so forms and actions agree. */
export const LIMITS = {
  name: 120, // person / org / unit / shop names
  title: 200, // post, event, listing, course titles
  label: 60, // short labels, categories, tags
  short: 300, // one-line text: headline, location, professional title
  bio: 2000,
  comment: 2000,
  message: 5000,
  description: 10000,
  post: 20000, // long-form article HTML
  url: 2048,
  email: 320,
  slug: 80,
  phone: 20,
  tag: 40,
  tags: 20, // max number of tags
} as const;

// ── patterns, compiled once ─────────────────────────────────────────────────
// Control characters except \t \n \r (kept for multi-line fields).
const CTRL_MULTI = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// Single-line fields also drop line breaks and tabs.
const CTRL_SINGLE = /[\u0000-\u001F\u007F]/g;
// Zero-width and bidi-override characters that make a value LOOK non-empty or
// reorder what is displayed. NOT U+200C/U+200D (zero-width non-joiner/joiner):
// emoji sequences (👩‍⚕️) and Malayalam/Devanagari spelling need them. They are
// kept in the value, but a value made of nothing else still counts as empty.
const INVISIBLE = /[​‎‏‪-‮⁠-⁤﻿]/g;
const JOINERS_ONLY = /^[‌‍\s]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INT = /^-?\d+$/;
// Money: digits, optional thousands separators (1,299 / 1,25,000), up to 2 decimals.
const MONEY = /^(?:\d+|\d{1,3}(?:,\d{2,3})+)(?:\.\d{1,2})?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** FormDataEntryValue | string | null | undefined → cleaned string ("" when absent). A File is not text. */
function clean(raw: unknown, multiline: boolean): string {
  if (typeof raw !== "string") return typeof raw === "number" && Number.isFinite(raw) ? String(raw) : "";
  let s = raw.replace(multiline ? CTRL_MULTI : CTRL_SINGLE, multiline ? "" : " ").replace(INVISIBLE, "");
  if (multiline) s = s.replace(/\r\n?/g, "\n");
  s = s.trim();
  return JOINERS_ONLY.test(s) ? "" : s;
}

// Emoji (and the flag / keycap / presentation-selector parts emoji are built
// from). Professional fields — names, titles, headlines — refuse them
// (Naveen, 2026-10-07: they read as cheap there). Free text (posts, comments,
// messages) is not checked. Digits, #, * and ordinary punctuation pass; ©, ®
// and ™ are pictographic in Unicode and are refused along with emoji.
// Built with the constructor: the tsconfig target predates ES6, so TypeScript
// refuses a /…/u literal, while every runtime we serve supports the u flag.
const EMOJI = new RegExp("[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3\\uFE0F]", "u");

const plural = (n: number) => `${n} character${n === 1 ? "" : "s"}`;

// ── text ────────────────────────────────────────────────────────────────────
export type TextOpts = { min?: number; multiline?: boolean; noEmoji?: boolean };

/** Required text: refused when empty or whitespace-only. */
export function reqText(raw: unknown, label: string, max: number, opts: TextOpts = {}): Valid<string> {
  const s = clean(raw, opts.multiline ?? false);
  if (!s) return bad(`${label} is required.`);
  if (s.length > max) return bad(`${label} must be ${plural(max)} or fewer.`);
  if (opts.min && s.length < opts.min) return bad(`${label} must be at least ${plural(opts.min)}.`);
  if (opts.noEmoji && EMOJI.test(s)) return bad(`${label} can't contain emoji.`);
  return ok(s);
}

/** Optional text: blank → null (never ""), otherwise the same rules as reqText. */
export function optText(raw: unknown, label: string, max: number, opts: TextOpts = {}): Valid<string | null> {
  const s = clean(raw, opts.multiline ?? false);
  if (!s) return ok(null);
  return reqText(s, label, max, opts);
}

// ── identifiers ─────────────────────────────────────────────────────────────
export function reqId(raw: unknown, label = "Id"): Valid<string> {
  const s = clean(raw, false);
  if (!s) return bad(`${label} is required.`);
  return UUID.test(s) ? ok(s.toLowerCase()) : bad(`${label} is not valid.`);
}
export function optId(raw: unknown, label = "Id"): Valid<string | null> {
  return clean(raw, false) ? reqId(raw, label) : ok(null);
}
/** A list of ids (e.g. selected members). Empty entries dropped; duplicates removed; capped. */
export function idList(raw: unknown, label: string, maxItems = 500): Valid<string[]> {
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const out = new Set<string>();
  for (const x of arr) {
    const s = clean(x, false);
    if (!s) continue;
    if (!UUID.test(s)) return bad(`${label} contains an invalid id.`);
    out.add(s.toLowerCase());
  }
  if (out.size > maxItems) return bad(`${label}: at most ${maxItems} at a time.`);
  return ok(Array.from(out));
}

export function reqSlug(raw: unknown, label = "URL", max: number = LIMITS.slug): Valid<string> {
  const s = clean(raw, false).toLowerCase();
  if (!s) return bad(`${label} is required.`);
  if (s.length > max) return bad(`${label} must be ${plural(max)} or fewer.`);
  return SLUG.test(s) ? ok(s) : bad(`${label} may only use lowercase letters, numbers and single hyphens.`);
}

// ── choices ─────────────────────────────────────────────────────────────────
export function reqOneOf<T extends string>(raw: unknown, label: string, allowed: readonly T[]): Valid<T> {
  const s = clean(raw, false);
  if (!s) return bad(`${label} is required.`);
  return (allowed as readonly string[]).includes(s) ? ok(s as T) : bad(`${label} is not a valid choice.`);
}
export function optOneOf<T extends string>(raw: unknown, label: string, allowed: readonly T[]): Valid<T | null> {
  return clean(raw, false) ? reqOneOf(raw, label, allowed) : ok(null);
}
/** Checkbox / toggle: "true" | "on" | "1" | true → true; anything else → false. Never empty. */
export function bool(raw: unknown): boolean {
  if (raw === true) return true;
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return s === "true" || s === "on" || s === "1" || s === "yes";
}

// ── numbers ─────────────────────────────────────────────────────────────────
export type NumOpts = { min?: number; max?: number };

export function reqInt(raw: unknown, label: string, opts: NumOpts = {}): Valid<number> {
  const s = clean(raw, false);
  if (!s) return bad(`${label} is required.`);
  if (!INT.test(s)) return bad(`${label} must be a whole number.`);
  return inRange(Number(s), label, opts);
}
export function optInt(raw: unknown, label: string, opts: NumOpts = {}): Valid<number | null> {
  return clean(raw, false) ? reqInt(raw, label, opts) : ok(null);
}

/** Money in the main unit (dollars/rupees), up to 2 decimals. "1,299.00" → 1299. "12.5abc" → refused. */
export function reqMoney(raw: unknown, label: string, opts: NumOpts = {}): Valid<number> {
  const s = clean(raw, false).replace(/^[$₹£€]\s*/, "");
  if (!s) return bad(`${label} is required.`);
  if (!MONEY.test(s)) return bad(`${label} must be an amount like 1299 or 1299.50.`);
  return inRange(Number(s.replace(/,/g, "")), label, opts);
}
export function optMoney(raw: unknown, label: string, opts: NumOpts = {}): Valid<number | null> {
  return clean(raw, false) ? reqMoney(raw, label, opts) : ok(null);
}

function inRange(n: number, label: string, { min, max }: NumOpts): Valid<number> {
  if (!Number.isFinite(n) || !Number.isSafeInteger(Math.round(n))) return bad(`${label} is not a valid number.`);
  if (min !== undefined && n < min) return bad(`${label} must be at least ${min}.`);
  if (max !== undefined && n > max) return bad(`${label} must be at most ${max}.`);
  return ok(n);
}

// ── contact ─────────────────────────────────────────────────────────────────
export function reqEmail(raw: unknown, label = "Email"): Valid<string> {
  const s = clean(raw, false).toLowerCase();
  if (!s) return bad(`${label} is required.`);
  if (s.length > LIMITS.email || !EMAIL.test(s)) return bad(`${label} is not a valid email address.`);
  return ok(s);
}
export function optEmail(raw: unknown, label = "Email"): Valid<string | null> {
  return clean(raw, false) ? reqEmail(raw, label) : ok(null);
}

/** http(s) URL. A bare host ("example.com") gets https:// — the form fields invite that. */
export function reqUrl(raw: unknown, label = "Link"): Valid<string> {
  const s = clean(raw, false);
  if (!s) return bad(`${label} is required.`);
  if (s.length > LIMITS.url) return bad(`${label} is too long.`);
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
  let u: URL;
  try { u = new URL(withScheme); } catch { return bad(`${label} is not a valid link.`); }
  if (u.protocol !== "https:" && u.protocol !== "http:") return bad(`${label} must start with https://`);
  if (!u.hostname.includes(".") || u.username || u.password) return bad(`${label} is not a valid link.`);
  return ok(u.toString());
}
export function optUrl(raw: unknown, label = "Link"): Valid<string | null> {
  return clean(raw, false) ? reqUrl(raw, label) : ok(null);
}

// ── dates ───────────────────────────────────────────────────────────────────
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A real calendar date "YYYY-MM-DD" (Feb 30 and month 13 are refused, not rolled over). */
export function reqDate(raw: unknown, label = "Date"): Valid<string> {
  const s = clean(raw, false);
  if (!s) return bad(`${label} is required.`);
  const m = DATE.exec(s);
  if (!m) return bad(`${label} is not a valid date.`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return bad(`${label} is not a real date.`);
  return ok(s);
}
export function optDate(raw: unknown, label = "Date"): Valid<string | null> {
  return clean(raw, false) ? reqDate(raw, label) : ok(null);
}

/** A real wall-clock "YYYY-MM-DDTHH:MM" from <input type="datetime-local">. Zone handling stays with the caller. */
export function reqDateTimeLocal(raw: unknown, label = "Date and time"): Valid<string> {
  const s = clean(raw, false);
  if (!s) return bad(`${label} is required.`);
  const m = DATETIME_LOCAL.exec(s);
  if (!m) return bad(`${label} is not valid.`);
  const [y, mo, d, h, mi, sec] = [1, 2, 3, 4, 5, 6].map((i) => Number(m[i] ?? 0));
  if (mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo) || h > 23 || mi > 59 || sec > 59) return bad(`${label} is not a real date and time.`);
  return ok(s);
}

// ── lists ───────────────────────────────────────────────────────────────────
/** Comma-separated (or array) tags: trimmed, empties dropped, de-duplicated (case-insensitive), capped. */
export function tagList(raw: unknown, label = "Tags", maxItems: number = LIMITS.tags, maxLen: number = LIMITS.tag): Valid<string[]> {
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const s = clean(x, false);
    if (!s) continue;
    if (s.length > maxLen) return bad(`Each of ${label.toLowerCase()} must be ${plural(maxLen)} or fewer.`);
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  if (out.length > maxItems) return bad(`${label}: at most ${maxItems}.`);
  return ok(out);
}

// ── combine ─────────────────────────────────────────────────────────────────
type Unwrap<T> = { [K in keyof T]: T[K] extends Valid<infer V> ? V : never };
/** Combine named results; the first error (in key order) wins. */
export function all<T extends Record<string, Valid<unknown>>>(fields: T): Valid<Unwrap<T>> {
  const out: Record<string, unknown> = {};
  for (const k in fields) {
    const r = fields[k];
    if (!r.ok) return r as Valid<never>;
    out[k] = r.value;
  }
  return ok(out as Unwrap<T>);
}

/** Safe own-key lookup — `key in obj` also matches "constructor", "toString", "__proto__". */
export function hasKey(obj: object, key: unknown): boolean {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(obj, key);
}

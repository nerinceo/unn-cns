// ─────────────────────────────────────────────────────────────────────────────
// UNN Learn — shared constants and pure helpers (CNS side).
//
// A single source of truth for the vocabularies the builder UI, the server
// actions and the validation layer all share, so a category can never drift
// between a <select> and its guard. Nothing here touches Supabase, so it is
// safe to import from client components.
//
// WHAT IS DELIBERATELY ABSENT: price bands, commission rates and earnings
// maths. A course is SOLD as a marketplace listing in HUB — price, payouts and
// the platform cut are listing concerns and live there. CNS authors and
// delivers the course; it never quotes a number it does not own. Duplicating
// the rate here is exactly how an instructor ends up shown a figure that
// checkout then contradicts.
// ─────────────────────────────────────────────────────────────────────────────

export type LmsCourseLevel = "beginner" | "intermediate" | "advanced" | "all";

// ── Course taxonomy ──────────────────────────────────────────────────────────
// Ordered by the demand thesis: the internationally educated nurse pathway
// leads, clinical practice follows, compliance last. "Other" stays at the end.
export const LMS_CATEGORIES = [
  "Exam Prep (NCLEX, CBT, OSCE)",
  "English for Nurses (OET, IELTS)",
  "Licensing & Credentialing",
  "Migration & Relocation",
  "Clinical Skills",
  "Specialty Practice",
  "Leadership & Management",
  "Career & Interview",
  "Research & Academia",
  "Wellbeing & Resilience",
  "Other",
] as const;

export type LmsCategory = (typeof LMS_CATEGORIES)[number];

export function isLmsCategory(v: unknown): v is LmsCategory {
  return typeof v === "string" && (LMS_CATEGORIES as readonly string[]).includes(v);
}

export const LMS_LEVELS: { value: LmsCourseLevel; label: string }[] = [
  { value: "all", label: "All levels" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

// ── Pricing ──────────────────────────────────────────────────────────────────
// The instructor sets the price here; on approval the platform generates the
// UNN marketplace listing from the course. One source of truth, so a figure
// shown to an instructor can never disagree with what a buyer is charged.
//
// The price is the instructor's to choose. This used to be a fixed set of
// bands; it is now free entry, bounded only by what a storefront and a payment
// processor can actually handle:
//
//   - 0 is free, and stays a first-class option — a free course needs no payout
//     account at all (see sellerReadiness).
//   - anything else sits between MIN and MAX, in whole cents.
//
// The ceiling is not taste, it is a typo guard: 99999 typed into a price field
// reaches a live listing and a real checkout otherwise. Two decimals because
// Stripe charges in cents, and a third would be silently rounded somewhere
// between here and the receipt.
export const MIN_COURSE_PRICE = 1;
export const MAX_COURSE_PRICE = 999.99;

export function isValidCoursePrice(v: unknown): boolean {
  // An empty string must not become a free course. Number("") is 0, so without
  // this an untouched price box would validate as "free" and publish as one.
  if (typeof v === "string" && v.trim() === "") return false;
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return false;
  if (n === 0) return true;
  if (n < MIN_COURSE_PRICE || n > MAX_COURSE_PRICE) return false;
  // Whole cents only: 24.99 yes, 24.999 no.
  return Math.round(n * 100) === Number((n * 100).toFixed(2));
}

/** The message shown wherever a price is refused, so the wording is identical. */
export const COURSE_PRICE_HINT = `Enter 0 for a free course, or a price between $${MIN_COURSE_PRICE} and $${MAX_COURSE_PRICE}.`;

/**
 * UNN's cut, in basis points.
 *
 * MUST MATCH `DEFAULT_COMMISSION_BPS.lms` in HUB's lib/marketplace/index.ts.
 * It is duplicated because CNS has no access to HUB's commerce module, and a
 * wrong number here is shown to an instructor as a promise about their income.
 *
 * This constant is only ever used for the ESTIMATE on the pricing screen. Every
 * figure on the sales dashboard is read from `orders.platform_fee` — the amount
 * actually taken on a real sale — because an estimate and a receipt must never
 * be presented as the same thing.
 */
export const LMS_COMMISSION_BPS = 500; // 5% — the instructor keeps 95%
export const INSTRUCTOR_SHARE_PERCENT = (10000 - LMS_COMMISSION_BPS) / 100;

/** What the instructor keeps on a sale at this list price, before refunds. */
export function instructorEarnings(price: number): number {
  const cents = Math.round(price * 100);
  return (cents - Math.round((cents * LMS_COMMISSION_BPS) / 10000)) / 100;
}

// ── Course readiness ─────────────────────────────────────────────────────────
export const MIN_COURSE_LECTURES = 5;
export const MIN_LEARNING_OUTCOMES = 4;

// NO MINIMUM DURATION. There was a 30-minute floor here; it was removed because
// it measures the wrong thing. total_duration_s only counts VIDEO, so a course
// written as articles scored zero however much was in it, and the checklist
// told a finished text course it was not ready. Length is not quality, and the
// lecture count already stops an empty course reaching review.

/**
 * The publish gate, evaluated identically by the builder sidebar and by
 * submitCourseForReview(). One function so the checklist an instructor stares
 * at can never disagree with the server that rejects them.
 */
export type ReadinessItem = { key: string; label: string; done: boolean };

export function courseReadiness(
  course: {
    title?: string | null;
    subtitle?: string | null;
    cover_url?: string | null;
    what_you_learn?: string[] | null;
    lecture_count?: number | null;
    total_duration_s?: number | null;
  },
  lectures: { kind: string; is_preview: boolean; video_status?: string | null }[],
): { items: ReadinessItem[]; ready: boolean; doneCount: number } {
  const unfinishedVideo = lectures.filter(
    (l) => l.kind === "video" && l.video_status !== "ready",
  ).length;

  const items: ReadinessItem[] = [
    {
      key: "basics",
      label: "Title and short description",
      done: !!course.title?.trim() && !!course.subtitle?.trim(),
    },
    {
      key: "outcomes",
      label: `At least ${MIN_LEARNING_OUTCOMES} learning outcomes`,
      done:
        (course.what_you_learn?.filter((s) => s.trim()).length ?? 0) >= MIN_LEARNING_OUTCOMES,
    },
    { key: "cover", label: "Cover image", done: !!course.cover_url },
    {
      key: "lectures",
      label: `At least ${MIN_COURSE_LECTURES} lectures`,
      done: (course.lecture_count ?? 0) >= MIN_COURSE_LECTURES,
    },
    {
      key: "preview",
      label: "At least one free preview lecture",
      done: lectures.some((l) => l.is_preview),
    },
    {
      key: "media",
      label: "Every video lecture has a processed video",
      done: unfinishedVideo === 0,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  return { items, ready: doneCount === items.length, doneCount };
}

// ── Formatting ───────────────────────────────────────────────────────────────
/** "6:12" / "1:04:30" from a second count. */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "3h 20m" — the coarse figure shown on cards. */
export function formatCourseLength(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** URL-safe slug from a course title, with a short suffix for uniqueness. */
export function courseSlug(title: string, suffix: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "course"}-${suffix}`;
}

// ── Instructor profile ───────────────────────────────────────────────────────
// Mirrors HUB's lib/lms/index.ts. Duplicated because CNS cannot import from the
// HUB codebase — keep the two in step, the same way the auth files are kept in
// step (see docs/SHARED-WITH-HUB.md).

export type LmsInstructorDocType = "nursing_license" | "degree" | "cv" | "id" | "other";

export const LMS_DOC_TYPES: {
  slug: LmsInstructorDocType;
  label: string;
  required: boolean;
}[] = [
  { slug: "nursing_license", label: "Nursing license / registration", required: true },
  { slug: "degree", label: "Degree or qualification", required: true },
  { slug: "cv", label: "CV / resume", required: false },
  { slug: "id", label: "Government ID", required: false },
  { slug: "other", label: "Other supporting document", required: false },
];

export function isLmsDocType(v: unknown): v is LmsInstructorDocType {
  return typeof v === "string" && LMS_DOC_TYPES.some((d) => d.slug === v);
}

export function lmsDocLabel(slug: string): string {
  return LMS_DOC_TYPES.find((d) => d.slug === slug)?.label ?? slug;
}

export const REQUIRED_LMS_DOC_TYPES = LMS_DOC_TYPES.filter((d) => d.required).map((d) => d.slug);

/** Which required credential documents are still missing. */
export function missingRequiredDocs(
  documents: { doc_type: string }[] | null | undefined,
): LmsInstructorDocType[] {
  const have = new Set((documents ?? []).map((d) => d.doc_type));
  return REQUIRED_LMS_DOC_TYPES.filter((t) => !have.has(t));
}

export const LMS_EXPERTISE = [
  "Medical-Surgical",
  "Critical Care / ICU",
  "Emergency",
  "Paediatrics",
  "Maternity & Midwifery",
  "Mental Health",
  "Oncology",
  "Perioperative",
  "Community & Public Health",
  "Geriatrics",
  "Pharmacology",
  "Nursing Education",
  "Leadership",
  "Informatics",
] as const;

export const MIN_INSTRUCTOR_BIO = 100;

/**
 * Everything standing between an instructor and a course that can be sold.
 *
 * ONE function, used by the dashboard progress bar, the settings page and the
 * sales page, so the three can never disagree about what is outstanding. Each
 * step names the thing to do and where it is done — a checklist that says
 * "payouts not connected" without saying where to fix it is a dead end.
 *
 * `blocksSelling` marks the steps that genuinely stop money changing hands, as
 * opposed to ones that merely make the profile look unfinished. It is the same
 * set the server enforces in HUB's syncCourseListing().
 */
export type SellerStep = {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  blocksSelling: boolean;
  /** Which settings tab (or external app) resolves it. */
  where: "profile" | "credentials" | "agreement" | "payouts" | "courses" | "review";
};

export function sellerReadiness(input: {
  status: string;
  displayName?: string | null;
  headline?: string | null;
  bio?: string | null;
  expertise?: string[] | null;
  agreementAcceptedAt?: string | null;
  documents?: { doc_type: string }[] | null;
  payoutsConnected: boolean;
  approvedCourseCount: number;
  hasPaidCourse: boolean;
}): { steps: SellerStep[]; doneCount: number; percent: number; canSell: boolean } {
  const steps: SellerStep[] = [
    {
      key: "profile",
      label: "Complete your teaching profile",
      detail: "Display name, headline and a bio of at least 100 characters.",
      done:
        !!input.displayName?.trim() &&
        !!input.headline?.trim() &&
        (input.bio?.trim().length ?? 0) >= MIN_INSTRUCTOR_BIO &&
        (input.expertise?.length ?? 0) > 0,
      blocksSelling: false,
      where: "profile",
    },
    {
      key: "credentials",
      label: "Upload your credentials",
      detail: "Nursing license and a degree or qualification.",
      done: missingRequiredDocs(input.documents).length === 0,
      blocksSelling: false,
      where: "credentials",
    },
    {
      key: "agreement",
      label: "Accept the Instructor Agreement",
      detail: "The contract that lets UNN sell your course on your behalf.",
      done: !!input.agreementAcceptedAt,
      // This is the contract. Without it there is no legal basis for a sale.
      blocksSelling: true,
      where: "agreement",
    },
    {
      key: "approved",
      label: "Get approved to teach",
      detail: "A UNN reviewer checks your credentials against your licence.",
      done: input.status === "approved",
      blocksSelling: true,
      where: "review",
    },
    {
      key: "payouts",
      label: "Connect payouts",
      detail: "Stripe, on UNN. Required before a paid course can go on sale.",
      done: input.payoutsConnected,
      // Only blocking once they actually price something: a free course is
      // sellable with no payout account, because nothing is ever transferred.
      blocksSelling: input.hasPaidCourse,
      where: "payouts",
    },
    {
      key: "course",
      label: "Publish a course",
      detail: "Build it, submit it, and it goes on sale the moment it's approved.",
      done: input.approvedCourseCount > 0,
      blocksSelling: true,
      where: "courses",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  return {
    steps,
    doneCount,
    percent: Math.round((doneCount / steps.length) * 100),
    canSell: steps.every((s) => !s.blocksSelling || s.done),
  };
}

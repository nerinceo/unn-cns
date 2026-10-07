/**
 * Job vocabulary. Pure data, no server imports — the composer is a client
 * component and needs these labels, so they cannot live in the `server-only`
 * data module.
 */

/**
 * Result ordering for the job board. Lives here, not in lib/cns/jobs.ts,
 * because the sort control is a client component and that module is
 * `server-only` — importing the list from there would throw at build time.
 */
export const JOB_SORTS = ["relevance", "recent", "closing"] as const;
export type JobSort = (typeof JOB_SORTS)[number];

export function isJobSort(v: unknown): v is JobSort {
  return typeof v === "string" && (JOB_SORTS as readonly string[]).includes(v);
}

/** One screen of results. Also the cap the RPC is called with. */
export const JOBS_PAGE_SIZE = 20;

/**
 * Our employment_type values -> schema.org's.
 *
 * Kept as an explicit map rather than storing Google's vocabulary directly, so
 * product wording ("Locum") can change without silently breaking the markup
 * that gets listings into Google for Jobs.
 */
export const EMPLOYMENT_TYPE_SCHEMA: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  locum: "PER_DIEM",
  internship: "INTERN",
  volunteer: "VOLUNTEER",
};

export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: "Full time",
  part_time: "Part time",
  contract: "Contract",
  locum: "Locum",
  internship: "Internship",
  volunteer: "Volunteer",
};

export const WORK_MODE_LABEL: Record<string, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
};

/** schema.org baseSalary unitText values. */
export const SALARY_PERIODS = ["HOUR", "DAY", "WEEK", "MONTH", "YEAR"] as const;

/**
 * Country name -> ISO 3166-1 alpha-2.
 *
 * schema.org accepts a country name, but Google prefers the two-letter code for
 * addressCountry and applicantLocationRequirements, and employers type free
 * text ("India", "india", "UAE"). Normalising here keeps the markup canonical
 * without forcing a dropdown on the composer.
 */
const COUNTRY_CODES: Record<string, string> = {
  india: "IN",
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  "united states": "US",
  usa: "US",
  us: "US",
  "united arab emirates": "AE",
  uae: "AE",
  "saudi arabia": "SA",
  qatar: "QA",
  oman: "OM",
  kuwait: "KW",
  bahrain: "BH",
  singapore: "SG",
  australia: "AU",
  canada: "CA",
  ireland: "IE",
  "new zealand": "NZ",
  germany: "DE",
  malta: "MT",
  philippines: "PH",
  nepal: "NP",
};

export function toCountryCode(input: string | null | undefined): string {
  if (!input) return "IN";
  const t = input.trim();
  // Names (and aliases) first: "uk" is two letters but NOT the ISO code — the
  // two-letter shortcut below used to turn it into "UK" instead of "GB".
  const named = COUNTRY_CODES[t.toLowerCase()];
  if (named) return named;
  // Already a code.
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return t;
}

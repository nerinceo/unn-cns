/**
 * Job vocabulary. Pure data, no server imports — the composer is a client
 * component and needs these labels, so they cannot live in the `server-only`
 * data module.
 */

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

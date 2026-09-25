/**
 * Job-seeker profile types and pure helpers.
 *
 * Deliberately NOT in lib/actions/seeker-profile.ts: a "use server" module may
 * only export async functions, so a synchronous helper there fails the build.
 */

export type SeekerProfile = {
  nursing_role: string | null;
  is_student: boolean;
  experience_level: string | null;
  total_years: number | null;
  specialties: string[];
  licence_country: string | null;
  licence_type: string | null;
  licence_number: string | null;
  licence_status: string | null;
  highest_qualification: string | null;
  institution: string | null;
  graduation_year: number | null;
  preferred_countries: string[];
  preferred_roles: string[];
  preferred_employment_types: string[];
  preferred_work_settings: string[];
};

export const EMPTY_SEEKER: SeekerProfile = {
  nursing_role: null, is_student: false, experience_level: null, total_years: null,
  specialties: [], licence_country: null, licence_type: null, licence_number: null,
  licence_status: null, highest_qualification: null, institution: null,
  graduation_year: null, preferred_countries: [], preferred_roles: [],
  preferred_employment_types: [], preferred_work_settings: [],
};

/**
 * Profile completeness (blueprint §8.4).
 *
 * Weighted by what an employer actually looks at rather than by field count: a
 * role and some experience matter far more than a preferred-country list. A
 * percentage is only useful if it moves for the right reasons.
 */
export function profileCompleteness(
  p: SeekerProfile,
  hasResume: boolean,
  hasName: boolean
): { percent: number; missing: string[] } {
  const checks = [
    { done: hasName, weight: 10, label: "Your name" },
    { done: Boolean(p.nursing_role), weight: 20, label: "Your nursing role" },
    { done: Boolean(p.experience_level), weight: 15, label: "Experience level" },
    { done: p.specialties.length > 0, weight: 15, label: "At least one specialty" },
    { done: hasResume, weight: 20, label: "A resume" },
    { done: Boolean(p.highest_qualification), weight: 10, label: "Your qualification" },
    { done: p.preferred_countries.length > 0, weight: 10, label: "Preferred countries" },
  ];
  const total = checks.reduce((n, c) => n + c.weight, 0);
  const got = checks.filter((c) => c.done).reduce((n, c) => n + c.weight, 0);
  return {
    percent: Math.round((got / total) * 100),
    missing: checks.filter((c) => !c.done).map((c) => c.label),
  };
}

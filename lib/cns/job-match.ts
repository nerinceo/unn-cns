/**
 * Job ↔ seeker match scoring.
 *
 * Pure and dependency-free so it can run in a server component, in a client
 * component, or inside the alerts cron without three copies drifting apart.
 *
 * WHY A LOCAL SHAPE INSTEAD OF CnsJob: lib/cns/jobs.ts is `import "server-only"`.
 * Taking a structural subset here keeps this module importable from a client
 * component without dragging that guard into the browser bundle, and documents
 * exactly which columns the score depends on.
 */

export type MatchableJob = {
  nursing_role: string | null;
  specialty: string | null;
  country: string | null;
  employment_type: string;
  work_setting: string | null;
  experience_min_years: number | null;
  license_required: boolean;
  is_remote: boolean;
  visa_sponsorship?: boolean | null;
};

export type MatchableSeeker = {
  nursing_role: string | null;
  specialties: string[];
  total_years: number | null;
  licence_country: string | null;
  licence_status: string | null;
  preferred_countries: string[];
  preferred_roles: string[];
  preferred_employment_types: string[];
  preferred_work_settings: string[];
};

export type MatchResult = {
  /** 0–100, or null when the profile says too little to score honestly. */
  percent: number | null;
  /** Why it scored well — shown on the card, max three. */
  reasons: string[];
  /** Hard mismatches worth warning about before the nurse spends an apply. */
  gaps: string[];
  /** False when the job states a minimum the profile does not meet. */
  meetsExperience: boolean;
};

/**
 * value→label maps, one per taxonomy kind, exactly as getJobLabels() returns.
 * Per-kind rather than one flat map on purpose: "Emergency" is both a specialty
 * and a work setting, with different values behind it.
 */
export type VocabMaps = {
  nursing_role: Record<string, string>;
  specialty: Record<string, string>;
  country: Record<string, string>;
  employment_type: Record<string, string>;
  work_setting: Record<string, string>;
};

function invert(valueToLabel: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [value, label] of Object.entries(valueToLabel ?? {})) {
    m.set(label.trim().toLowerCase(), value);
    // A value that is already a value maps to itself, so normalising twice is
    // harmless and a mixed-vocabulary snapshot still resolves.
    m.set(value.trim().toLowerCase(), value);
  }
  return m;
}

/**
 * Translate a job-application snapshot's seeker block into taxonomy VALUES.
 *
 * cns_job_applications.profile_snapshot.seeker is written for humans — it
 * stores "Staff Nurse", "ICU / Critical Care", "India". cns_jobs stores
 * "staff-nurse", "icu-critical-care", "india". Scoring one against the other
 * matches nothing, so the employer saw "0% fit" on a candidate the nurse-facing
 * board scored at 100% for the very same job.
 *
 * Done on read rather than by changing what apply writes, because that is the
 * only fix that also repairs every application already in the table.
 */
export function normaliseSeekerVocabulary(
  seeker: MatchableSeeker,
  vocab: VocabMaps
): MatchableSeeker {
  const role = invert(vocab.nursing_role);
  const spec = invert(vocab.specialty);
  const country = invert(vocab.country);
  const empType = invert(vocab.employment_type);
  const setting = invert(vocab.work_setting);

  const one = (m: Map<string, string>, v: string | null) =>
    v === null || v === undefined ? null : m.get(v.trim().toLowerCase()) ?? v;
  const many = (m: Map<string, string>, xs: string[]) =>
    (xs ?? []).map((x) => m.get(String(x).trim().toLowerCase()) ?? x);

  return {
    ...seeker,
    nursing_role: one(role, seeker.nursing_role),
    specialties: many(spec, seeker.specialties),
    preferred_roles: many(role, seeker.preferred_roles),
    preferred_countries: many(country, seeker.preferred_countries),
    preferred_employment_types: many(empType, seeker.preferred_employment_types),
    preferred_work_settings: many(setting, seeker.preferred_work_settings),
    licence_country: one(country, seeker.licence_country),
  };
}

/** A profile this thin produces a meaningless number; say nothing instead. */
function tooThin(s: MatchableSeeker): boolean {
  return (
    !s.nursing_role &&
    s.specialties.length === 0 &&
    s.preferred_countries.length === 0 &&
    s.preferred_roles.length === 0
  );
}

/**
 * Signals are weighted by what actually decides whether a nurse takes the job,
 * and — critically — a signal only counts toward the denominator when the
 * profile EXPRESSES it. Scoring an unstated preference as a miss would mean a
 * half-filled profile caps out at 40% and every job looks like a bad fit, which
 * teaches people to ignore the number.
 */
export function scoreJobMatch(job: MatchableJob, seeker: MatchableSeeker): MatchResult {
  const reasons: string[] = [];
  const gaps: string[] = [];

  let earned = 0;
  let possible = 0;
  const signal = (weight: number, hit: boolean) => {
    possible += weight;
    if (hit) earned += weight;
  };

  // Role — the strongest single signal. Either the nurse's own role or one
  // they said they want next (a staff nurse targeting charge nurse roles).
  const roleWanted = [seeker.nursing_role, ...seeker.preferred_roles].filter(Boolean) as string[];
  if (roleWanted.length && job.nursing_role) {
    const hit = roleWanted.includes(job.nursing_role);
    signal(30, hit);
    if (hit) reasons.push("Matches your nursing role");
  }

  // Specialty — an ICU nurse reading a theatre job is the wrong result.
  if (seeker.specialties.length && job.specialty) {
    const hit = seeker.specialties.includes(job.specialty);
    signal(25, hit);
    if (hit) reasons.push("Matches your specialty");
  }

  // Country. Remote roles are location-agnostic, so a country miss on a remote
  // job is not a miss at all — scoring it as one buries the very listings a
  // relocating nurse can take from anywhere.
  if (seeker.preferred_countries.length && job.country && !job.is_remote) {
    const hit = seeker.preferred_countries.includes(job.country);
    signal(20, hit);
    if (hit) reasons.push("In a country you want to work in");
    else gaps.push("Outside your preferred countries");
  }

  if (seeker.preferred_employment_types.length) {
    const hit = seeker.preferred_employment_types.includes(job.employment_type);
    signal(10, hit);
    if (hit) reasons.push("Your preferred employment type");
  }

  if (seeker.preferred_work_settings.length && job.work_setting) {
    const hit = seeker.preferred_work_settings.includes(job.work_setting);
    signal(10, hit);
    if (hit) reasons.push("Your preferred work setting");
  }

  // Experience is scored as a threshold, not a distance: a job asking for 2
  // years is equally happy with 3 or 12.
  let meetsExperience = true;
  if (job.experience_min_years != null && job.experience_min_years > 0) {
    const years = seeker.total_years;
    if (years != null) {
      meetsExperience = years >= job.experience_min_years;
      signal(15, meetsExperience);
      if (meetsExperience) reasons.push(`${job.experience_min_years}+ years experience met`);
      else gaps.push(`Asks for ${job.experience_min_years}+ years experience`);
    }
  }

  // Licensing is the quiet blocker on international roles: a job that requires
  // a licence in its own country, held by a nurse licensed elsewhere, is a slow
  // rejection unless the employer sponsors. Worth surfacing before the apply,
  // never worth scoring — sponsorship and conversion routes vary too much.
  if (job.license_required && seeker.licence_country && job.country) {
    if (seeker.licence_country !== job.country && !job.visa_sponsorship) {
      gaps.push("Requires a local licence you have not listed");
    }
  }
  if (job.visa_sponsorship && seeker.preferred_countries.includes(job.country ?? "")) {
    // unshift, not push. Reasons are capped at three for card space, and this
    // is evaluated last — appending it meant the most decisive fact for an
    // internationally educated nurse was the first thing truncated away,
    // behind "your preferred employment type".
    reasons.unshift("Offers visa sponsorship");
  }

  if (tooThin(seeker) || possible === 0) {
    return { percent: null, reasons: [], gaps, meetsExperience };
  }

  return {
    percent: Math.round((earned / possible) * 100),
    reasons: reasons.slice(0, 3),
    gaps,
    meetsExperience,
  };
}

/** Above this a job is worth putting in front of someone unprompted. */
export const RECOMMEND_THRESHOLD = 60;

export function matchTone(percent: number): "strong" | "good" | "weak" {
  if (percent >= 80) return "strong";
  if (percent >= RECOMMEND_THRESHOLD) return "good";
  return "weak";
}

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYMENT_TYPE_SCHEMA } from "./job-constants";

// Re-exported so server components can pull data + labels from one place.
export { EMPLOYMENT_TYPE_LABEL, WORK_MODE_LABEL, EMPLOYMENT_TYPE_SCHEMA } from "./job-constants";

/**
 * Jobs data access + schema.org/JobPosting mapping.
 *
 * Published job pages are readable by `anon` (see cns_jobs.sql), so these reads
 * work with or without a session — which is what makes the pages crawlable.
 */

export const JOB_COLS =
  "id,slug,title,description,responsibilities,qualifications,employment_type,work_mode," +
  "country,state,city,street_address,postal_code,specialty,experience_min_years," +
  "qualification_required,license_required,salary_min,salary_max,salary_currency," +
  "salary_period,salary_undisclosed,vacancies,application_deadline,apply_mode," +
  "external_apply_url,status,published_at,employer_id,created_at";

export const EMPLOYER_PUBLIC_COLS =
  "id,slug,name,employer_type,description,logo_url,website,country,city,verification_status";

export type CnsEmployer = {
  id: string;
  slug: string;
  name: string;
  employer_type: string;
  description: string | null;
  logo_url: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  verification_status: string;
};

export type CnsJob = {
  id: string;
  slug: string;
  title: string;
  description: string;
  responsibilities: string | null;
  qualifications: string | null;
  employment_type: string;
  work_mode: string;
  country: string | null;
  state: string | null;
  city: string | null;
  street_address: string | null;
  postal_code: string | null;
  specialty: string | null;
  experience_min_years: number | null;
  qualification_required: string | null;
  license_required: boolean;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  salary_undisclosed: boolean;
  vacancies: number;
  application_deadline: string | null;
  apply_mode: string;
  external_apply_url: string | null;
  status: string;
  published_at: string | null;
  employer_id: string;
  created_at: string;
};

export function formatSalary(job: CnsJob): string | null {
  if (job.salary_undisclosed || (!job.salary_min && !job.salary_max)) return null;
  const cur = job.salary_currency ?? "INR";
  const fmt = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
  const per = (job.salary_period ?? "MONTH").toLowerCase();
  const range =
    job.salary_min && job.salary_max
      ? `${fmt(job.salary_min)} – ${fmt(job.salary_max)}`
      : fmt((job.salary_min ?? job.salary_max)!);
  return `${cur} ${range} / ${per}`;
}

/**
 * schema.org/JobPosting JSON-LD.
 *
 * Generated from the same row the page renders — never hand-maintained —
 * because Google issues a manual action when the markup disagrees with what a
 * human sees on the page.
 *
 * Required: title, description, datePosted, hiringOrganization, jobLocation
 * (jobLocation may be omitted only when applicantLocationRequirements is set,
 * which is the remote case handled below).
 */
export function buildJobPostingJsonLd(job: CnsJob, employer: CnsEmployer, url: string) {
  const isRemote = job.work_mode === "remote";

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    // Must be HTML and a complete representation of the role.
    description: jobDescriptionHtml(job),
    datePosted: (job.published_at ?? job.created_at).slice(0, 10),
    hiringOrganization: {
      "@type": "Organization",
      name: employer.name,
      ...(employer.website ? { sameAs: employer.website } : {}),
      ...(employer.logo_url ? { logo: employer.logo_url } : {}),
    },
    identifier: {
      "@type": "PropertyValue",
      name: employer.name,
      value: job.slug,
    },
    employmentType: EMPLOYMENT_TYPE_SCHEMA[job.employment_type] ?? "OTHER",
    url,
    // We are the streamlined-application case: one tap using a profile the
    // member already has, no third-party redirect and no re-registration.
    directApply: job.apply_mode === "in_app",
  };

  // validThrough is effectively mandatory: Google treats a missing expiry as a
  // quality signal against the listing, and a board full of stale undated jobs
  // can have every listing removed.
  if (job.application_deadline) {
    ld.validThrough = `${job.application_deadline}T23:59:59`;
  }

  if (isRemote) {
    ld.jobLocationType = "TELECOMMUTE";
    // A telecommute posting must still declare where applicants may be based.
    ld.applicantLocationRequirements = {
      "@type": "Country",
      name: job.country ?? "IN",
    };
  } else {
    ld.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        ...(job.street_address ? { streetAddress: job.street_address } : {}),
        ...(job.city ? { addressLocality: job.city } : {}),
        ...(job.state ? { addressRegion: job.state } : {}),
        ...(job.postal_code ? { postalCode: job.postal_code } : {}),
        addressCountry: job.country ?? "IN",
      },
    };
  }

  // Employer-stated pay only — never an estimate, which Google prohibits.
  if (!job.salary_undisclosed && (job.salary_min || job.salary_max)) {
    ld.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salary_currency ?? "INR",
      value: {
        "@type": "QuantitativeValue",
        ...(job.salary_min ? { minValue: Number(job.salary_min) } : {}),
        ...(job.salary_max ? { maxValue: Number(job.salary_max) } : {}),
        unitText: job.salary_period ?? "MONTH",
      },
    };
  }

  return ld;
}

/** The description, as HTML, used by BOTH the page and the JSON-LD. */
export function jobDescriptionHtml(job: CnsJob): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const para = (s: string) =>
    s
      .split(/\n{2,}/)
      .map((p) => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`)
      .join("");

  let html = para(job.description);
  if (job.responsibilities) html += `<h3>Responsibilities</h3>${para(job.responsibilities)}`;
  if (job.qualifications) html += `<h3>Qualifications</h3>${para(job.qualifications)}`;
  return html;
}

/* -------------------------------------------------------------------------- */

export async function listPublishedJobs(filters?: {
  q?: string;
  specialty?: string;
  employmentType?: string;
  workMode?: string;
  country?: string;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("cns_jobs")
    .select(JOB_COLS)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(50);

  if (filters?.specialty) query = query.eq("specialty", filters.specialty);
  if (filters?.employmentType) query = query.eq("employment_type", filters.employmentType);
  if (filters?.workMode) query = query.eq("work_mode", filters.workMode);
  if (filters?.country) query = query.eq("country", filters.country);
  if (filters?.q) query = query.ilike("title", `%${filters.q}%`);

  // Cast through unknown: supabase-js cannot infer a row type from a column
  // list built by string concatenation, and infers GenericStringError instead.
  const { data } = await query;
  const jobs = (data ?? []) as unknown as CnsJob[];
  if (!jobs.length) return [];

  const employerIds = Array.from(new Set(jobs.map((j) => j.employer_id)));
  const { data: employerRows } = await supabase
    .from("cns_employers")
    .select(EMPLOYER_PUBLIC_COLS)
    .in("id", employerIds);

  const employers = (employerRows ?? []) as unknown as CnsEmployer[];
  const byId = new Map(employers.map((e) => [e.id, e]));
  return jobs.map((j) => ({ job: j, employer: byId.get(j.employer_id) }));
}

export async function getJobBySlug(slug: string) {
  const supabase = await createClient();
  const { data: jobRow } = await supabase
    .from("cns_jobs")
    .select(JOB_COLS)
    .eq("slug", slug)
    .maybeSingle();
  const job = jobRow as unknown as CnsJob | null;
  if (!job) return null;

  const { data: employerRow } = await supabase
    .from("cns_employers")
    .select(EMPLOYER_PUBLIC_COLS)
    .eq("id", job.employer_id)
    .maybeSingle();

  return { job, employer: (employerRow as unknown as CnsEmployer) ?? null };
}

/** Employers the signed-in member can act for. */
export async function getMyEmployers() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_employer_members")
    .select("role,status,employer:employer_id(id,slug,name,status,verification_status,logo_url)")
    .eq("status", "approved");
  return (data ?? []) as unknown as {
    role: string;
    status: string;
    employer: { id: string; slug: string; name: string; status: string; verification_status: string; logo_url: string | null };
  }[];
}

export async function getEmployerJobs(employerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_jobs")
    .select(JOB_COLS)
    .eq("employer_id", employerId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as CnsJob[];
}

export async function getMyApplications() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_job_applications")
    .select("id,job_id,status,status_changed_at,created_at,job:job_id(slug,title,city,country)")
    .order("created_at", { ascending: false });
  return data ?? [];
}

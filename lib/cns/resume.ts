import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Resume document model.
 *
 * A deliberate superset of what public.profiles stores. Measured on production:
 * education/experience are populated in 2 of 96 profiles, and profiles.experience
 * carries no dates at all — so pre-fill is a head start, not the source of truth.
 */

export type ResumeLink = { label: string; url: string };
export type ResumeExperience = {
  title: string;
  employer: string;
  location?: string;
  start?: string; // "2023-04" — month precision is enough for a CV
  end?: string;
  current?: boolean;
  bullets: string[];
};
export type ResumeEducation = {
  degree: string;
  field?: string;
  institution: string;
  location?: string;
  start?: string;
  end?: string;
  grade?: string;
};
export type ResumeCertification = {
  name: string;
  issuer?: string;
  year?: string;
  credential_id?: string;
};
export type ResumeRegistration = {
  council: string; // "Indian Nursing Council", "NMC (UK)"
  number: string;
  country?: string;
  expires?: string;
};
export type ResumeLanguage = { name: string; level?: string };

export type ResumeContent = {
  header: {
    full_name: string;
    headline?: string;
    email?: string;
    phone?: string;
    location?: string;
    links: ResumeLink[];
  };
  summary?: string;
  registration: ResumeRegistration[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  certifications: ResumeCertification[];
  skills: string[];
  specialties: string[];
  languages: ResumeLanguage[];
  section_order?: string[];
};

export type CnsResume = {
  id: string;
  title: string;
  template: "ats" | "designed";
  content: ResumeContent;
  is_default: boolean;
  public_token: string | null;
  updated_at: string;
};

export const EMPTY_CONTENT: ResumeContent = {
  header: { full_name: "", links: [] },
  registration: [],
  experience: [],
  education: [],
  certifications: [],
  skills: [],
  specialties: [],
  languages: [],
};

/**
 * Build a starting document from whatever the member already has on UNN.
 *
 * Maps HUB's shapes onto the richer resume model. profiles.experience is only
 * {id, title, employer}, so dates and bullets come back empty and the editor
 * has to prompt for them — that gap is expected, not a bug.
 */
export async function buildSeedContent(): Promise<ResumeContent> {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub as string | undefined;
  if (!uid) return { ...EMPTY_CONTENT };

  // Both queries MUST filter by id. RLS on public.users permits reading many
  // rows (members can see each other), so an unfiltered .maybeSingle() matches
  // multiple rows and silently returns null — which looked exactly like "the
  // profile is empty" and made the whole pre-fill a no-op.
  const { data: user } = await supabase
    .from("users")
    .select("full_name,email,professional_title,bio,country,phone,profile_url")
    .eq("id", uid)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select("education,experience,skills,languages,certificates")
    .eq("user_id", uid)
    .maybeSingle();

  const rawEdu = Array.isArray(profile?.education) ? profile!.education : [];
  const rawExp = Array.isArray(profile?.experience) ? profile!.experience : [];
  const rawCert = Array.isArray(profile?.certificates) ? profile!.certificates : [];
  const rawLang = Array.isArray(profile?.languages) ? profile!.languages : [];
  const rawSkills = Array.isArray(profile?.skills) ? profile!.skills : [];

  return {
    header: {
      full_name: (user?.full_name as string) ?? "",
      headline: (user?.professional_title as string) ?? "",
      email: (user?.email as string) ?? "",
      phone: (user?.phone as string) ?? "",
      location: (user?.country as string) ?? "",
      links: user?.profile_url
        ? [{ label: "UNN Profile", url: user.profile_url as string }]
        : [],
    },
    // bio is prose about the person, which is exactly what a CV summary is.
    summary: (user?.bio as string) ?? "",
    registration: [],
    experience: rawExp.map((e: Record<string, unknown>) => ({
      title: (e.title as string) ?? "",
      employer: (e.employer as string) ?? "",
      location: (e.location as string) ?? "",
      start: (e.start_year as string) ?? "",
      end: (e.end_year as string) ?? "",
      current: Boolean(e.current),
      bullets: e.description ? [e.description as string] : [],
    })),
    education: rawEdu.map((e: Record<string, unknown>) => ({
      degree: (e.degree as string) ?? "",
      field: (e.field_of_study as string) ?? "",
      institution: (e.institution as string) ?? "",
      start: (e.start_year as string) ?? "",
      end: (e.end_year as string) ?? "",
      grade: (e.grade as string) ?? "",
    })),
    certifications: rawCert.map((c: Record<string, unknown>) => ({
      name: (c.name as string) ?? (c.title as string) ?? "",
      issuer: (c.issuer as string) ?? "",
      year: (c.year as string) ?? "",
    })),
    skills: rawSkills.filter((s): s is string => typeof s === "string"),
    specialties: [],
    languages: rawLang.map((l: unknown) =>
      typeof l === "string" ? { name: l } : { name: String((l as { name?: string })?.name ?? "") }
    ),
  };
}

/** How much of the seed actually produced anything — drives the empty state. */
export function seedCoverage(c: ResumeContent) {
  return {
    hasSummary: Boolean(c.summary?.trim()),
    experience: c.experience.length,
    education: c.education.length,
    skills: c.skills.length,
    isEssentiallyEmpty:
      !c.summary?.trim() && !c.experience.length && !c.education.length && !c.skills.length,
  };
}

export async function listResumes(): Promise<CnsResume[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_resumes")
    .select("id,title,template,content,is_default,public_token,updated_at")
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  return (data ?? []) as CnsResume[];
}

export async function getResume(id: string): Promise<CnsResume | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_resumes")
    .select("id,title,template,content,is_default,public_token,updated_at")
    .eq("id", id)
    .maybeSingle();
  return (data as CnsResume) ?? null;
}

/** Public share lookup. Goes through the definer function, never the table. */
export async function getPublicResume(token: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cns_public_resume", { p_token: token });
  if (error || !data?.length) return null;
  const row = data[0];
  return {
    title: row.title as string,
    template: row.template as "ats" | "designed",
    content: row.content as ResumeContent,
    authorName: row.author_name as string,
    authorPhoto: row.author_photo as string | null,
    verified: row.verification_status === "verified",
    updatedAt: row.updated_at as string,
  };
}

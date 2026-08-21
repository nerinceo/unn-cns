import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApplicationPipeline, type PipelineRow } from "@/components/jobs/ApplicationPipeline";
import { evaluateScreening, type ScreeningQuestion } from "@/lib/cns/screening";
import {
  scoreJobMatch,
  normaliseSeekerVocabulary,
  type MatchableJob,
  type MatchableSeeker,
} from "@/lib/cns/job-match";
import { getJobLabels } from "@/lib/cns/taxonomy";

export const dynamic = "force-dynamic";

/** The job columns the fit score reads. Kept narrow on purpose. */
const MATCH_JOB_COLS =
  "id,title,slug,nursing_role,specialty,country,employment_type,work_setting," +
  "experience_min_years,license_required,is_remote,visa_sponsorship";

/**
 * supabase-js cannot infer a row type from a column list built by string
 * concatenation and falls back to GenericStringError, so the shape is declared
 * here — same reason lib/cns/jobs.ts casts through unknown.
 */
type MatchJobRow = MatchableJob & { id: string; title: string; slug: string };

/** The applicant's job profile, as frozen into profile_snapshot at apply time. */
function seekerFromSnapshot(snapshot: Record<string, unknown>): MatchableSeeker | null {
  const s = (snapshot?.seeker ?? null) as Record<string, unknown> | null;
  if (!s) return null;
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  return {
    nursing_role: (s.nursing_role as string) ?? null,
    specialties: arr(s.specialties),
    total_years: typeof s.total_years === "number" ? s.total_years : null,
    licence_country: (s.licence_country as string) ?? null,
    licence_status: (s.licence_status as string) ?? null,
    preferred_countries: arr(s.preferred_countries),
    preferred_roles: arr(s.preferred_roles),
    preferred_employment_types: arr(s.preferred_employment_types),
    preferred_work_settings: arr(s.preferred_work_settings),
  };
}

export default async function ApplicationsInbox({
  params,
  searchParams,
}: {
  params: Promise<{ employerId: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const { employerId } = await params;
  const { job: jobFilter } = await searchParams;
  const supabase = await createClient();

  const { data: employer } = await supabase
    .from("cns_employers")
    .select("id,name")
    .eq("id", employerId)
    .maybeSingle();
  if (!employer) notFound();

  const { data: jobRows } = await supabase
    .from("cns_jobs")
    .select(MATCH_JOB_COLS)
    .eq("employer_id", employerId);
  const jobs = (jobRows ?? []) as unknown as MatchJobRow[];
  const jobIds = jobs.map((j) => j.id);

  // RLS restricts these to jobs belonging to an employer the caller is an
  // approved member of.
  let q = supabase
    .from("cns_job_applications")
    .select(
      "id,job_id,applicant_id,cover_note,profile_snapshot,status,status_changed_at,employer_note,created_at,resume_id,resume_file_id"
    )
    .in("job_id", jobIds.length ? jobIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });
  if (jobFilter) q = q.eq("job_id", jobFilter);
  const { data: applications } = await q;

  const applicationIds = (applications ?? []).map((a) => a.id as string);

  // Screening rules live on the job; answers live on the application. Both are
  // needed to say whether an applicant cleared the employer's stated bar.
  const [{ data: questionRows }, { data: answerRows }] = await Promise.all([
    supabase
      .from("cns_job_screening_questions")
      .select("id,job_id,question,question_type,is_required,knockout_expected,knockout_min")
      .in("job_id", jobIds.length ? jobIds : ["00000000-0000-0000-0000-000000000000"]),
    applicationIds.length
      ? supabase
          .from("cns_application_answers")
          .select("application_id,question_id,question_text,answer")
          .in("application_id", applicationIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const questionsByJob = new Map<string, ScreeningQuestion[]>();
  for (const r of questionRows ?? []) {
    const list = questionsByJob.get(r.job_id as string) ?? [];
    list.push({
      id: r.id as string,
      question: r.question as string,
      question_type: r.question_type as ScreeningQuestion["question_type"],
      is_required: Boolean(r.is_required),
      knockout_expected: (r.knockout_expected as "yes" | "no" | null) ?? null,
      knockout_min: r.knockout_min === null ? null : Number(r.knockout_min),
    });
    questionsByJob.set(r.job_id as string, list);
  }

  const answersByApplication = new Map<
    string,
    { question_id: string | null; question_text: string; answer: string | null }[]
  >();
  for (const r of answerRows ?? []) {
    const key = r.application_id as string;
    const list = answersByApplication.get(key) ?? [];
    list.push({
      question_id: (r.question_id as string) ?? null,
      question_text: (r.question_text as string) ?? "",
      answer: (r.answer as string) ?? null,
    });
    answersByApplication.set(key, list);
  }

  // Contact details are NOT in the snapshot — they are released only once an
  // applicant is shortlisted, which is the promise made on the apply screen.
  // 'selected' is the blueprint's name for what used to be 'offered'; keeping
  // the old name here withheld a hired candidate's contact details.
  const shortlistedIds = (applications ?? [])
    .filter((a) => ["shortlisted", "interview", "selected"].includes(a.status as string))
    .map((a) => a.applicant_id as string);

  const contactById = new Map<string, { email: string | null; phone: string | null }>();
  if (shortlistedIds.length) {
    // Contact release for shortlisted applicants (the employer is entitled to
    // these, filtered by shortlistedIds). email is no longer in the session
    // grant (0020), so read it through the service role.
    const { data: contacts } = await createAdminClient()
      .from("users")
      .select("id,email,phone")
      .in("id", shortlistedIds);
    for (const c of contacts ?? []) {
      contactById.set(c.id as string, {
        email: (c.email as string) ?? null,
        phone: (c.phone as string) ?? null,
      });
    }
  }

  const jobById = new Map(jobs.map((j) => [j.id, j]));

  // The snapshot stores display labels ("Staff Nurse"), the job stores taxonomy
  // values ("staff-nurse"). Without this translation every fit score reads 0%.
  const labels = await getJobLabels();

  const rows: PipelineRow[] = (applications ?? []).map((a) => {
    const job = jobById.get(a.job_id as string);
    const snapshot = (a.profile_snapshot ?? {}) as Record<string, unknown>;
    const raw = seekerFromSnapshot(snapshot);
    const seeker = raw ? normaliseSeekerVocabulary(raw, labels) : null;

    const match =
      job && seeker
        ? scoreJobMatch(job, seeker)
        : { percent: null, reasons: [], gaps: [], meetsExperience: true };

    return {
      id: a.id as string,
      jobId: a.job_id as string,
      jobTitle: job?.title ?? "Role",
      snapshot,
      coverNote: (a.cover_note as string) ?? null,
      status: a.status as string,
      employerNote: (a.employer_note as string) ?? null,
      createdAt: a.created_at as string,
      contact: contactById.get(a.applicant_id as string) ?? null,
      applicantName: (snapshot.full_name as string) ?? "Applicant",
      applicantId: a.applicant_id as string,
      // Flag only — the signed CV link is minted on click, not per render.
      hasResume: Boolean(a.resume_file_id || a.resume_id),
      matchPercent: match.percent,
      screening: evaluateScreening(
        questionsByJob.get(a.job_id as string) ?? [],
        answersByApplication.get(a.id as string) ?? []
      ),
    };
  });

  return (
    <div className="space-y-6">
      <Link
        href={`/employer/${employerId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {employer.name}
      </Link>

      <header>
        <div className="flex items-center gap-3">
          <Inbox className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Applications</h1>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Contact details appear once you shortlist an applicant.
        </p>
      </header>

      {jobs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/employer/${employerId}/applications`}
            className={`rounded-md border px-3 py-1.5 text-xs ${!jobFilter ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
          >
            All
          </Link>
          {jobs.map((j) => (
            <Link
              key={j.id}
              href={`/employer/${employerId}/applications?job=${j.id}`}
              className={`rounded-md border px-3 py-1.5 text-xs ${jobFilter === j.id ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
            >
              {j.title}
            </Link>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No applications yet.
        </p>
      ) : (
        <ApplicationPipeline rows={rows} />
      )}
    </div>
  );
}

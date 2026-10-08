import { jsonLdHtml } from "@/lib/json-ld";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft, MapPin, Clock, Banknote, ShieldCheck, Users, CalendarDays, BadgeCheck,
} from "lucide-react";
import {
  getJobBySlug, getEndedJobBySlug, formatSalary, buildJobPostingJsonLd, jobDescriptionHtml,
} from "@/lib/cns/jobs";
import { getJobLabels } from "@/lib/cns/taxonomy";
import { ReportJobButton } from "@/components/jobs/ReportJobButton";
import { getCurrentUser, createClient } from "@/lib/supabase/server";
import { recordJobView } from "@/lib/cns/job-views";
import { ApplyPanel } from "@/components/jobs/ApplyPanel";
import { SaveJobButton } from "@/components/jobs/SaveJobButton";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cns.nerusalem.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const live = await getJobBySlug(slug);
  const found = live?.job?.status === "active" ? live : await getEndedJobBySlug(slug);
  if (!found?.job) return { title: "Job not found" };
  const { job, employer } = found;
  // An ended role stays reachable for applicants but must not be re-indexed.
  const robots = job.status === "active" ? undefined : { index: false, follow: true };
  const where = [job.city, job.country].filter(Boolean).join(", ");
  return {
    title: `${job.title} — ${employer?.name ?? "Nerusalem"}`,
    description: job.description.slice(0, 155),
    alternates: { canonical: `${SITE}/jobs/${job.slug}` },
    openGraph: {
      title: `${job.title}${where ? ` — ${where}` : ""}`,
      description: job.description.slice(0, 155),
      type: "article",
    },
    ...(robots ? { robots } : {}),
  };
}

export default async function JobDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // RLS only exposes published jobs to anon, but a member of the employer can
  // also read drafts — never render those as if they were live.
  const live = await getJobBySlug(slug);
  const found = live?.job?.status === "active" ? live : await getEndedJobBySlug(slug);
  if (!found?.job || !found.employer) notFound();

  const { job, employer } = found;
  const ended = job.status !== "active";

  const user = await getCurrentUser();

  // Deduped per viewer per day in the database, so a refresh does not inflate
  // it and an employer previewing their own role does not either.
  if (!ended) await recordJobView(job.id);

  const url = `${SITE}/jobs/${job.slug}`;
  const [jsonLd, labels] = await Promise.all([
    buildJobPostingJsonLd(job, employer, url),
    getJobLabels(),
  ]);

  // Screening questions are readable by anyone (the apply form must render
  // them before submission); the rest only matters once signed in.
  const supabase = await createClient();
  const { data: questions } = await supabase
    .from("cns_job_screening_questions")
    .select("id,question,question_type,is_required,knockout_expected,knockout_min")
    .eq("job_id", job.id)
    .order("position");

  let resumes: { id: string; label: string; kind: "file" | "built" }[] = [];
  let alreadyApplied = false;
  let withdrawn = false;
  let saved = false;
  if (user) {
    const [{ data: files }, { data: built }, { data: existing }, { data: saveRow }] = await Promise.all([
      supabase
        .from("cns_resume_files")
        .select("id,file_name")
        .eq("user_id", user.id)
        .eq("is_active", true),
      supabase.from("cns_resumes").select("id,title").order("is_default", { ascending: false }),
      supabase
        .from("cns_job_applications")
        .select("id,status")
        .eq("job_id", job.id)
        .eq("applicant_id", user.id)
        .maybeSingle(),
      supabase
        .from("cns_job_saves")
        .select("job_id")
        .eq("job_id", job.id)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    saved = Boolean(saveRow);
    resumes = [
      ...(files ?? []).map((f) => ({
        id: f.id as string,
        label: `${f.file_name as string} (uploaded)`,
        kind: "file" as const,
      })),
      ...(built ?? []).map((b) => ({
        id: b.id as string,
        label: `${b.title as string} (built in Nerusalem)`,
        kind: "built" as const,
      })),
    ];
    alreadyApplied = Boolean(existing);
    withdrawn = existing?.status === "withdrawn";
  }
  const salary = job.salary_text ?? formatSalary(job);
  const countryLabel = labels.country[job.country as string] ?? job.country;
  const location = [job.city, job.state, countryLabel].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      {/*
        Generated from the SAME row the page below renders. Google issues a
        manual action when markup disagrees with the visible page, so these must
        never be maintained separately.
      */}
      {!ended && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
        />
      )}

      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All jobs
      </Link>

      <header>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          {/* /saved tells members to "use the bookmark on any role"; until
              2026-10-08 no role page carried one. */}
          {user && !ended && <SaveJobButton jobId={job.id} saved={saved} withLabel />}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
          <Link href={`/employers/${employer.slug}`} className="hover:text-foreground hover:underline">
            {employer.name}
          </Link>
          {employer.verification_status === "verified" && (
            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <ShieldCheck className="h-3 w-3" /> Verified employer
            </span>
          )}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-4">
        <Fact icon={MapPin} label="Location">
          {location || "—"}
          {job.is_remote && <span className="block text-xs text-muted-foreground">Remote</span>}
        </Fact>
        <Fact icon={Clock} label="Type">
          {labels.employment_type[job.employment_type] ?? job.employment_type}
        </Fact>
        <Fact icon={Banknote} label="Salary">
          {salary ?? "Not disclosed"}
        </Fact>
        <Fact icon={Users} label="Vacancies">
          {job.vacancies}
        </Fact>
      </dl>

      {(job.experience_level || job.experience_min_years || job.nursing_role || job.work_setting || job.license_required || job.qualification_required || job.specialty) && (
        <div className="flex flex-wrap gap-2">
          {job.experience_level && (
            <Chip>{labels.experience_level[job.experience_level] ?? job.experience_level}</Chip>
          )}
          {job.experience_min_years ? (
            <Chip>
              {job.experience_min_years}+ {job.experience_min_years === 1 ? "year" : "years"} experience
            </Chip>
          ) : null}
          {job.nursing_role && <Chip>{labels.nursing_role[job.nursing_role]}</Chip>}
          {job.work_setting && <Chip>{labels.work_setting[job.work_setting]}</Chip>}
          {job.license_required && (
            <Chip>
              <BadgeCheck className="mr-1 inline h-3 w-3" />
              Registration required
            </Chip>
          )}
          {job.qualification_required && <Chip>{job.qualification_required}</Chip>}
          {job.specialty && <Chip>{labels.specialty[job.specialty] ?? job.specialty}</Chip>}
        </div>
      )}

      <ApplyPanel
        jobId={job.id}
        jobSlug={job.slug}
        applyMode={job.apply_mode}
        externalUrl={job.external_apply_url}
        signedIn={Boolean(user)}
        deadline={job.application_deadline}
        questions={(questions ?? []) as never}
        resumes={resumes}
        alreadyApplied={alreadyApplied}
        withdrawn={withdrawn}
        ended={ended}
      />

      {/* Same HTML that goes into the JSON-LD description. */}
      <article
        className="prose-sm max-w-none space-y-3 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-medium [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-foreground"
        dangerouslySetInnerHTML={{ __html: jobDescriptionHtml(job) }}
      />

      {job.application_deadline && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          Applications close {new Date(job.application_deadline).toLocaleDateString()}
        </p>
      )}

      <ReportJobButton jobId={job.id as string} canReport={Boolean(user)} />
    </div>
  );
}

function Fact({
  icon: Icon, label, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

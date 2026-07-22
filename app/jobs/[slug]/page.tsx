import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft, MapPin, Clock, Banknote, ShieldCheck, Users, CalendarDays, BadgeCheck,
} from "lucide-react";
import {
  getJobBySlug, formatSalary, buildJobPostingJsonLd, jobDescriptionHtml,
  EMPLOYMENT_TYPE_LABEL, WORK_MODE_LABEL,
} from "@/lib/cns/jobs";
import { getCurrentUser } from "@/lib/supabase/server";
import { ApplyPanel } from "@/components/jobs/ApplyPanel";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cns.unnhub.org";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const found = await getJobBySlug(slug);
  if (!found?.job) return { title: "Job not found" };
  const { job, employer } = found;
  const where = [job.city, job.country].filter(Boolean).join(", ");
  return {
    title: `${job.title} — ${employer?.name ?? "UNN"}`,
    description: job.description.slice(0, 155),
    alternates: { canonical: `${SITE}/jobs/${job.slug}` },
    openGraph: {
      title: `${job.title}${where ? ` — ${where}` : ""}`,
      description: job.description.slice(0, 155),
      type: "article",
    },
  };
}

export default async function JobDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getJobBySlug(slug);
  if (!found?.job || !found.employer) notFound();

  const { job, employer } = found;
  // RLS only exposes published jobs to anon, but a member of the employer can
  // also read drafts — don't render those as if they were live.
  if (job.status !== "published") notFound();

  const user = await getCurrentUser();
  const url = `${SITE}/jobs/${job.slug}`;
  const jsonLd = buildJobPostingJsonLd(job, employer, url);
  const salary = formatSalary(job);
  const location = [job.city, job.state, job.country].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      {/*
        Generated from the SAME row the page below renders. Google issues a
        manual action when markup disagrees with the visible page, so these must
        never be maintained separately.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All jobs
      </Link>

      <header>
        <h1 className="text-2xl font-semibold">{job.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
          {employer.name}
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
          {job.work_mode !== "onsite" && (
            <span className="block text-xs text-muted-foreground">
              {WORK_MODE_LABEL[job.work_mode]}
            </span>
          )}
        </Fact>
        <Fact icon={Clock} label="Type">
          {EMPLOYMENT_TYPE_LABEL[job.employment_type]}
        </Fact>
        <Fact icon={Banknote} label="Salary">
          {salary ?? "Not disclosed"}
        </Fact>
        <Fact icon={Users} label="Vacancies">
          {job.vacancies}
        </Fact>
      </dl>

      {(job.experience_min_years != null || job.license_required || job.qualification_required) && (
        <div className="flex flex-wrap gap-2">
          {job.experience_min_years != null && (
            <Chip>{job.experience_min_years}+ years experience</Chip>
          )}
          {job.license_required && (
            <Chip>
              <BadgeCheck className="mr-1 inline h-3 w-3" />
              Registration required
            </Chip>
          )}
          {job.qualification_required && <Chip>{job.qualification_required}</Chip>}
          {job.specialty && <Chip>{job.specialty}</Chip>}
        </div>
      )}

      <ApplyPanel
        jobId={job.id}
        jobSlug={job.slug}
        applyMode={job.apply_mode}
        externalUrl={job.external_apply_url}
        signedIn={Boolean(user)}
        deadline={job.application_deadline}
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

import { jsonLdHtml } from "@/lib/json-ld";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft, Building2, ShieldCheck, Globe, MapPin, Briefcase,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getJobLabels } from "@/lib/cns/taxonomy";
import { getMySeekerProfile } from "@/lib/cns/seeker-data";
import { scoreJobMatch } from "@/lib/cns/job-match";
import { JOB_COLS, EMPLOYER_PUBLIC_COLS, type CnsJob, type CnsEmployer } from "@/lib/cns/jobs";
import { JobCard } from "@/components/jobs/JobCard";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cns.nerusalem.com";

/**
 * A hospital's own page.
 *
 * The board previously had no route for an employer at all: a nurse could read
 * one role from a hospital and had no way to see the other six, and searching
 * the hospital's name on Google reached nothing of ours. Both of those are
 * demand we were already generating and then dropping.
 *
 * Only approved employers resolve. An organisation still in the review queue
 * having a public, indexable page would be UNN appearing to vouch for it.
 */
async function loadEmployer(slug: string) {
  const supabase = await createClient();

  const { data: employerRow } = await supabase
    .from("cns_employers")
    .select(EMPLOYER_PUBLIC_COLS + ",status")
    .eq("slug", slug)
    .maybeSingle();

  const employer = employerRow as unknown as (CnsEmployer & { status: string }) | null;
  if (!employer || employer.status !== "approved") return null;

  const { data: jobRows } = await supabase
    .from("cns_jobs")
    .select(JOB_COLS)
    .eq("employer_id", employer.id)
    .eq("status", "active")
    .order("published_at", { ascending: false })
    .limit(50);

  return { employer, jobs: (jobRows ?? []) as unknown as CnsJob[] };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const found = await loadEmployer(slug);
  if (!found) return { title: "Employer not found" };

  const { employer, jobs } = found;
  const where = [employer.city, employer.country].filter(Boolean).join(", ");
  return {
    title: `${employer.name} — nursing jobs`,
    description:
      employer.description?.slice(0, 155) ??
      `${jobs.length} open nursing ${jobs.length === 1 ? "role" : "roles"} at ${employer.name}${
        where ? ` in ${where}` : ""
      }.`,
    alternates: { canonical: `${SITE}/employers/${employer.slug}` },
  };
}

export default async function EmployerProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await loadEmployer(slug);
  if (!found) notFound();

  const { employer, jobs } = found;
  const [labels, seeker] = await Promise.all([getJobLabels(), getMySeekerProfile()]);
  const where = [employer.city, labels.country[employer.country ?? ""] ?? employer.country]
    .filter(Boolean)
    .join(", ");

  // Organization markup, so a search for the hospital's name can surface this
  // page rather than only the individual JobPosting pages.
  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Organization",
    name: employer.name,
    url: `${SITE}/employers/${employer.slug}`,
    ...(employer.website ? { sameAs: employer.website } : {}),
    ...(employer.logo_url ? { logo: employer.logo_url } : {}),
    ...(employer.description ? { description: employer.description } : {}),
    ...(where
      ? { address: { "@type": "PostalAddress", addressLocality: employer.city ?? undefined } }
      : {}),
  };

  return (
    <div className="space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />

      <Link
        href="/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All jobs
      </Link>

      <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start gap-5">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
            {employer.logo_url ? (
              <Image
                src={employer.logo_url}
                alt=""
                fill
                className="object-contain p-1"
                sizes="64px"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <Building2 className="h-7 w-7 text-muted-foreground/50" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
              {employer.name}
              {employer.verification_status === "verified" && (
                <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  <ShieldCheck className="h-3 w-3" /> Verified by UNN
                </span>
              )}
            </h1>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="capitalize">{employer.employer_type.replace(/_/g, " ")}</span>
              {where && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {where}
                </span>
              )}
              {employer.website && (
                <a
                  href={employer.website}
                  target="_blank"
                  // noopener is what actually matters; noreferrer keeps us from
                  // leaking the nurse's path through the site to the hospital.
                  rel="noopener noreferrer nofollow"
                  className="flex items-center gap-1.5 hover:text-foreground"
                >
                  <Globe className="h-3.5 w-3.5" />
                  Website
                </a>
              )}
            </div>

            {employer.description && (
              <p className="mt-3 max-w-2xl whitespace-pre-line text-sm text-muted-foreground">
                {employer.description}
              </p>
            )}
          </div>
        </div>
      </header>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-medium">
          <Briefcase className="h-4 w-4 text-primary" />
          {jobs.length === 0
            ? "No open roles"
            : `${jobs.length} open ${jobs.length === 1 ? "role" : "roles"}`}
        </h2>

        {jobs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {employer.name} has no roles open right now. Browse everything else on the board, or
            set up a job alert on your profile.
          </p>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <JobCard
                  job={job}
                  employer={employer}
                  labels={labels}
                  match={seeker ? scoreJobMatch(job, seeker) : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

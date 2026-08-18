import Link from "next/link";
import {
  MapPin,
  Clock,
  ShieldCheck,
  Banknote,
  Building2,
  Plane,
} from "lucide-react";
import { formatSalary, type CnsJob, type CnsEmployer } from "@/lib/cns/jobs";
import type { MatchResult } from "@/lib/cns/job-match";
import { MatchBadge, MatchReasons } from "./MatchBadge";

/**
 * One job row.
 *
 * Extracted from app/jobs/page.tsx so the results list, the recommended rail
 * and the employer profile page render an identical card. Three hand-copied
 * variants was how the board ended up showing salary in one place and not
 * another.
 */
export type JobLabels = {
  country: Record<string, string>;
  specialty: Record<string, string>;
  nursing_role: Record<string, string>;
  employment_type: Record<string, string>;
  work_setting: Record<string, string>;
};

export function JobCard({
  job,
  employer,
  labels,
  match,
}: {
  job: CnsJob;
  employer: CnsEmployer | undefined;
  labels: JobLabels;
  match?: MatchResult;
}) {
  const salary = job.salary_text ?? formatSalary(job);
  const location = [job.city, labels.country[job.country ?? ""] ?? job.country]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={`/jobs/${job.slug}`}
      className="group block rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-medium group-hover:text-primary">{job.title}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            {employer?.name ?? "Employer"}
            {employer?.verification_status === "verified" && (
              <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-label="Verified employer" />
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {match && <MatchBadge match={match} />}
          {job.specialty && (
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {labels.specialty[job.specialty] ?? job.specialty}
            </span>
          )}
        </div>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {location && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {location}
            {job.is_remote && " · Remote"}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {labels.employment_type[job.employment_type] ?? job.employment_type}
        </div>
        {job.nursing_role && (
          <div>{labels.nursing_role[job.nursing_role] ?? job.nursing_role}</div>
        )}
        {job.work_setting && (
          <div>{labels.work_setting[job.work_setting] ?? job.work_setting}</div>
        )}
        {salary && (
          <div className="flex items-center gap-1.5">
            <Banknote className="h-3.5 w-3.5" />
            {salary}
          </div>
        )}
        {job.visa_sponsorship && (
          <div className="flex items-center gap-1.5 text-primary">
            <Plane className="h-3.5 w-3.5" />
            Visa sponsorship
          </div>
        )}
      </dl>

      {match && <MatchReasons match={match} />}
    </Link>
  );
}

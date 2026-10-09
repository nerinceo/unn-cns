import Link from "next/link";
import {
  MapPin,
  Clock,
  ShieldCheck,
  Banknote,
  Building2,
  Plane,
  ArrowRight,
  Stethoscope,
  Hospital,
  Globe,
} from "lucide-react";
import { formatSalary, isImportedJob, type CnsJob, type CnsEmployer } from "@/lib/cns/jobs";
import type { MatchResult } from "@/lib/cns/job-match";
import { MatchBadge, MatchReasons } from "./MatchBadge";

/**
 * One job row.
 *
 * Extracted from app/jobs/page.tsx so the results list, the recommended rail
 * and the employer profile page render an identical card. Three hand-copied
 * variants was how the board ended up showing salary in one place and not
 * another.
 *
 * The facts a nurse actually decides on — where, what hours, what pay, will
 * they sponsor — are pills rather than a run-on line of grey text, so a long
 * results list can be scanned rather than read.
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
  const verified = employer?.verification_status === "verified";

  return (
    <Link
      href={`/jobs/${job.slug}`}
      className="group relative flex overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover"
    >
      {/* Sponsored roles get the accent: for a nurse looking abroad it is the
          single fact that decides whether the rest of the card matters. */}
      <span
        aria-hidden
        className={`w-1 shrink-0 ${job.visa_sponsorship ? "bg-emerald-500" : "bg-primary/70"}`}
      />

      <div className="min-w-0 flex-1 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Hospital className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold leading-snug group-hover:text-primary">
                {job.title}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[14px] font-medium text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                {employer?.name ?? "Employer"}
                {verified && (
                  <ShieldCheck
                    className="h-3.5 w-3.5 shrink-0 text-primary"
                    aria-label="Verified employer"
                  />
                )}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {match && <MatchBadge match={match} />}
            {job.specialty && (
              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-[12px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/25">
                <Stethoscope className="h-3 w-3" />
                {labels.specialty[job.specialty] ?? job.specialty}
              </span>
            )}
          </div>
        </div>

        <dl className="mt-4 flex flex-wrap items-center gap-2">
          {location && (
            <Fact icon={MapPin}>
              {location}
              {job.is_remote && " · Remote"}
            </Fact>
          )}
          <Fact icon={Clock}>
            {labels.employment_type[job.employment_type] ?? job.employment_type}
          </Fact>
          {job.nursing_role && <Fact>{labels.nursing_role[job.nursing_role] ?? job.nursing_role}</Fact>}
          {job.work_setting && <Fact>{labels.work_setting[job.work_setting] ?? job.work_setting}</Fact>}
          {salary && (
            <Fact icon={Banknote} tone="pay">
              {salary}
            </Fact>
          )}
          {job.visa_sponsorship && (
            <Fact icon={Plane} tone="visa">
              Visa sponsorship
            </Fact>
          )}
          {isImportedJob(job) && job.source_name && (
            <Fact icon={Globe}>Via {job.source_name}</Fact>
          )}
        </dl>

        {match && <MatchReasons match={match} />}
      </div>

      <span className="flex shrink-0 items-center pr-4">
        <ArrowRight className="h-4 w-4 -translate-x-1 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
      </span>
    </Link>
  );
}

/**
 * One scannable fact. `pay` and `visa` are tinted because they are the two a
 * nurse filters on hardest; everything else stays neutral so the tint keeps
 * its meaning.
 */
function Fact({
  icon: Icon,
  tone = "neutral",
  children,
}: {
  icon?: typeof MapPin;
  tone?: "neutral" | "pay" | "visa";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-muted text-slate-700 ring-border dark:text-slate-300",
    pay: "bg-success-soft text-success ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    visa: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  } as const;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13.5px] font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      {children}
    </div>
  );
}

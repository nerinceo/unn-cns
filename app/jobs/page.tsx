import Link from "next/link";
import { Briefcase, MapPin, Clock, ShieldCheck, Banknote, Building2 } from "lucide-react";
import { listPublishedJobs, formatSalary } from "@/lib/cns/jobs";
import { getTaxonomy, getJobLabels } from "@/lib/cns/taxonomy";
import { JobFilters } from "@/components/jobs/JobFilters";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nursing Jobs — UNN",
  description:
    "Nursing roles from verified hospitals, clinics and recruitment agencies. Apply with your UNN profile.",
};

/** Repeated query params arrive as a string or an array; normalise to an array. */
function many(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : v.split(",").filter(Boolean);
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const selected = {
    country: many(sp.country),
    role: many(sp.role),
    specialty: many(sp.specialty),
    employmentType: many(sp.type),
    workSetting: many(sp.setting),
    experience: many(sp.experience),
  };
  const q = typeof sp.q === "string" ? sp.q : "";

  const [results, taxonomy, labels] = await Promise.all([
    listPublishedJobs({ q, ...selected }),
    getTaxonomy(),
    getJobLabels(),
  ]);

  const activeCount = Object.values(selected).reduce((n, v) => n + v.length, 0);

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <Briefcase className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">Nursing Jobs</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Roles from hospitals, clinics and agencies verified by UNN. Apply in one tap with the
          profile you already have.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* Left panel on wide screens, drawer on small — blueprint §5. */}
        <JobFilters taxonomy={taxonomy} selected={selected} q={q} />

        <div className="min-w-0 space-y-4">
          <p className="text-sm text-muted-foreground">
            {results.length} {results.length === 1 ? "role" : "roles"}
            {activeCount > 0 && ` · ${activeCount} filter${activeCount === 1 ? "" : "s"} applied`}
          </p>

          {results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
              <p className="font-medium">No roles match those filters</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Try removing a filter, or browse the latest roles.
              </p>
              <Link
                href="/jobs"
                className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
              >
                Clear all filters
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {results.map(({ job, employer }) => {
                const salary = job.salary_text ?? formatSalary(job);
                const location = [job.city, labels.country[job.country ?? ""] ?? job.country]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <li key={job.id}>
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
                              <ShieldCheck
                                className="h-3.5 w-3.5 text-primary"
                                aria-label="Verified employer"
                              />
                            )}
                          </p>
                        </div>
                        {job.specialty && (
                          <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {labels.specialty[job.specialty] ?? job.specialty}
                          </span>
                        )}
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
                      </dl>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

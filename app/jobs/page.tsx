import Link from "next/link";
import { Briefcase, MapPin, Clock, ShieldCheck, Banknote } from "lucide-react";
import {
  listPublishedJobs,
  formatSalary,
  EMPLOYMENT_TYPE_LABEL,
  WORK_MODE_LABEL,
} from "@/lib/cns/jobs";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nursing Jobs — UNN",
  description:
    "Nursing roles from verified hospitals, clinics and recruitment agencies. Apply with your UNN profile.",
};

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; specialty?: string; type?: string; mode?: string }>;
}) {
  const sp = await searchParams;
  const results = await listPublishedJobs({
    q: sp.q,
    specialty: sp.specialty,
    employmentType: sp.type,
    workMode: sp.mode,
  });

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

      <form className="flex flex-wrap gap-2" action="/jobs">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search by title"
          className="h-10 min-w-[200px] flex-1 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary"
        />
        <select
          name="type"
          defaultValue={sp.type ?? ""}
          className="h-10 rounded-md border border-border bg-card px-3 text-sm"
        >
          <option value="">Any type</option>
          {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          name="mode"
          defaultValue={sp.mode ?? ""}
          className="h-10 rounded-md border border-border bg-card px-3 text-sm"
        >
          <option value="">Anywhere</option>
          {Object.entries(WORK_MODE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Search
        </button>
      </form>

      {results.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No roles match yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            New positions are posted regularly — try widening your filters.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {results.map(({ job, employer }) => {
            const salary = formatSalary(job);
            const location = [job.city, job.country].filter(Boolean).join(", ");
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
                        {employer?.name ?? "Employer"}
                        {employer?.verification_status === "verified" && (
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-label="Verified employer" />
                        )}
                      </p>
                    </div>
                    {job.specialty && (
                      <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {job.specialty}
                      </span>
                    )}
                  </div>

                  <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    {location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {location}
                        {job.work_mode !== "onsite" && ` · ${WORK_MODE_LABEL[job.work_mode]}`}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {EMPLOYMENT_TYPE_LABEL[job.employment_type]}
                    </div>
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
  );
}

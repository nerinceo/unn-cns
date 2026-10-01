import Link from "next/link";
import { Search, ShieldCheck, ArrowRight } from "lucide-react";
import type { Category } from "@/lib/cns/taxonomy";

/**
 * Jobs home (blueprint §8.1).
 *
 * Shown only when there is no search or filter in the URL — the moment someone
 * searches, the results view takes over. Directory-style browse and a results
 * list are different jobs and sharing one screen does neither well.
 *
 * Counts come from live data, and a facet with zero jobs is not rendered:
 * a shortcut that leads to an empty page is worse than no shortcut.
 */
export function JobsHome({
  countries,
  specialties,
  roles,
  verifiedEmployers,
  totalJobs,
}: {
  countries: { cat: Category; count: number }[];
  specialties: { cat: Category; count: number }[];
  roles: { cat: Category; count: number }[];
  verifiedEmployers: { id: string; name: string; slug: string }[];
  totalJobs: number;
}) {
  return (
    <div className="space-y-10">
      <section className="rounded-lg border border-border bg-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold sm:text-3xl">Nursing jobs, from verified employers</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {totalJobs > 0
            ? `${totalJobs} open ${totalJobs === 1 ? "role" : "roles"} across hospitals, clinics and agencies checked by Nerusalem. Apply in one tap with the profile you already have.`
            : "Roles from hospitals, clinics and agencies checked by Nerusalem. Apply in one tap with the profile you already have."}
        </p>

        <form action="/jobs" className="mt-5 flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              placeholder="Job title, city or keyword"
              aria-label="Search jobs"
              className="h-11 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <button className="h-11 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground">
            Search
          </button>
        </form>

        {countries.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Popular:</span>
            {countries.slice(0, 8).map(({ cat, count }) => (
              <Link
                key={cat.value}
                href={`/jobs?country=${cat.value}`}
                className="rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
              >
                {cat.label} <span className="text-muted-foreground">({count})</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Facets title="Jobs by specialty" param="specialty" items={specialties} />
      <Facets title="Jobs by role" param="role" items={roles} />

      {/* §8.1: only show this section once there are enough approved employers
          to make it look like a directory rather than a gap. */}
      {verifiedEmployers.length >= 3 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Verified employers
          </h2>
          <div className="flex flex-wrap gap-2">
            {verifiedEmployers.map((e) => (
              // Was a dead <span>. A nurse who recognises the hospital wants
              // its other roles, and that was the one thing they could not do.
              <Link
                key={e.id}
                href={`/employers/${e.slug}`}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:border-primary"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                {e.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-border bg-muted p-5">
        <p className="font-medium">Hiring nurses?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Post roles to a network of verified nurses. Every applicant arrives with their
          credentials already checked.
        </p>
        <Link
          href="/employer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Register your organisation <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    </div>
  );
}

function Facets({
  title,
  param,
  items,
}: {
  title: string;
  param: string;
  items: { cat: Category; count: number }[];
}) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(({ cat, count }) => (
          <Link
            key={cat.value}
            href={`/jobs?${param}=${cat.value}`}
            className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 text-sm transition-colors hover:border-primary"
          >
            <span>{cat.label}</span>
            <span className="text-xs text-muted-foreground">{count}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

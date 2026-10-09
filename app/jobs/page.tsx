import Link from "next/link";
import { Briefcase, Sparkles, UserRoundCog } from "lucide-react";
import { searchPublishedJobs, isJobSort, JOBS_PAGE_SIZE } from "@/lib/cns/jobs";
import { getTaxonomy, getJobLabels } from "@/lib/cns/taxonomy";
import { getMySeekerProfile } from "@/lib/cns/seeker-data";
import { scoreJobMatch, RECOMMEND_THRESHOLD } from "@/lib/cns/job-match";
import { JobFilters } from "@/components/jobs/JobFilters";
import { JobsHero } from "@/components/jobs/JobsHero";
import { JobsAside } from "@/components/jobs/JobsAside";
import { JobCard } from "@/components/jobs/JobCard";
import { JobSort } from "@/components/jobs/JobSort";
import { JobPagination } from "@/components/jobs/JobPagination";
import { createClient } from "@/lib/supabase/server";
import { hubLink } from "@/lib/hub";
import type { SeekerProfile } from "@/lib/cns/seeker";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nursing Jobs — Nerusalem",
  description:
    "Nursing and healthcare jobs across India, the Gulf, the UK and beyond. Easy apply to verified employers with your Nerusalem profile.",
};

/** Repeated query params arrive as a string or an array; normalise to an array. */
function many(v: string | string[] | undefined): string[] {
  if (!v) return [];
  // Blank entries dropped: the hero's "All countries" submits country="",
  // and an empty value would filter the board down to nothing.
  return (Array.isArray(v) ? v : v.split(",")).filter(Boolean);
}

function one(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * The nurse's own preferences, as job-board filters.
 *
 * Role and specialty only — country is deliberately left out. A relocating
 * nurse's preferred country is a ranking signal, not a gate: filtering on it
 * would hide the sponsoring employer in a country they had not thought to list,
 * which is the single most valuable listing we can show them.
 */
function recommendFilters(p: SeekerProfile) {
  const roles = Array.from(new Set([p.nursing_role, ...p.preferred_roles].filter(Boolean)));
  return {
    role: roles as string[],
    specialty: p.specialties,
  };
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
  const q = one(sp.q) ?? "";
  const postedWithin = Number(one(sp.posted)) || undefined;
  const sponsorship = one(sp.sponsorship) === "1" ? true : undefined;
  const remote = one(sp.remote) === "1" ? true : undefined;
  const sort = isJobSort(sp.sort) ? sp.sort : "relevance";
  const page = Math.max(Number(one(sp.page)) || 1, 1);

  const narrowed =
    Object.values(selected).reduce((n, v) => n + v.length, 0) +
    (postedWithin ? 1 : 0) +
    (sponsorship ? 1 : 0) +
    (remote ? 1 : 0);

  const supabase = await createClient();
  const [labels, seeker, taxonomy, search, { data: verified }] = await Promise.all([
    getJobLabels(),
    getMySeekerProfile(),
    getTaxonomy(),
    // Search-first: the unfiltered board is simply the newest roles (employer-
    // posted ones ranked first by cns_search_jobs), not a directory of links
    // to click through before seeing a single job.
    searchPublishedJobs({
      q,
      ...selected,
      postedWithin,
      sponsorship,
      remote,
      sort,
      page,
      pageSize: JOBS_PAGE_SIZE,
    }),
    supabase
      .from("cns_employers")
      .select("id,name,slug")
      .eq("status", "approved")
      .eq("verification_status", "verified")
      .limit(8),
  ]);
  const { results, total, pageCount } = search;

  // Params minus `page`, so the pager can rebuild every other part of the URL.
  const carried = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "page" || v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) if (item) carried.append(k, item);
  }
  // What the hero's form must carry: everything except what it edits. With
  // more than one country ticked in the sidebar the hero leaves country alone.
  const heroOwnsCountry = selected.country.length <= 1;
  const heroCarried = Array.from(carried.entries()).filter(
    ([k]) => k !== "q" && !(heroOwnsCountry && k === "country")
  );

  const from = (page - 1) * JOBS_PAGE_SIZE + 1;
  const to = Math.min(page * JOBS_PAGE_SIZE, total);
  const browsing = narrowed === 0 && !q && page === 1;

  return (
    <div className="space-y-6">
      <JobsHero
        q={q}
        country={heroOwnsCountry ? selected.country[0] ?? "" : ""}
        countries={taxonomy.country}
        carried={heroCarried}
        total={browsing ? total : 0}
        quick={{
          sponsorship: Boolean(sponsorship),
          remote: Boolean(remote),
          recent: postedWithin === 7,
          base: carried.toString(),
        }}
      />

      {browsing && seeker && <RecommendedForYou seeker={seeker} labels={labels} />}

      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_260px]">
        {/* Left panel on wide screens, drawer on small — blueprint §5. */}
        <JobFilters taxonomy={taxonomy} selected={selected} q={q} />

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {total === 0 ? (
                "No roles"
              ) : (
                <>
                  <span className="tabular-nums">
                    {from}–{to}
                  </span>{" "}
                  of <span className="tabular-nums font-medium text-foreground">{total}</span>{" "}
                  {total === 1 ? "role" : "roles"}
                </>
              )}
              {narrowed > 0 && ` · ${narrowed} filter${narrowed === 1 ? "" : "s"} applied`}
              {/* Alerts match on country and role only — the two the daily
                  digest reads — so the link appears when one of them is set. */}
              {(selected.country.length > 0 || selected.role.length > 0) && (
                <>
                  {" · "}
                  <Link
                    href={`/saved?${new URLSearchParams([
                      ...selected.country.map((c) => ["country", c]),
                      ...selected.role.map((r) => ["role", r]),
                    ]).toString()}#alerts`}
                    className="text-primary hover:underline"
                  >
                    Get alerts for these filters
                  </Link>
                </>
              )}
            </p>
            {total > 1 && <JobSort sort={sort} />}
          </div>

          {results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <Briefcase className="mx-auto h-8 w-8 text-muted-foreground/60" />
              {browsing ? (
                <>
                  <p className="mt-3 font-medium">No open roles right now</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                    New roles are added several times a day. Set up an alert and we will tell you.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 font-medium">No roles match that search</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                    Try a broader keyword or remove a filter.
                  </p>
                  <Link
                    href="/jobs"
                    className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
                  >
                    See all roles
                  </Link>
                </>
              )}
            </div>
          ) : (
            <>
              <ul className="space-y-3">
                {results.map(({ job, employer }) => (
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
              <JobPagination page={page} pageCount={pageCount} query={carried} />
            </>
          )}
        </div>

        <div className="lg:col-start-2 xl:col-start-auto">
          <JobsAside verifiedEmployers={(verified ?? []) as { id: string; name: string; slug: string }[]} />
        </div>
      </div>
    </div>
  );
}

/**
 * Jobs picked for this member.
 *
 * Only rendered when the score clears RECOMMEND_THRESHOLD — a "recommended"
 * rail padded out with 30% matches trains people to skip it, and then the one
 * time it holds the right job they do not look.
 */
async function RecommendedForYou({
  seeker,
  labels,
}: {
  seeker: SeekerProfile;
  labels: Awaited<ReturnType<typeof getJobLabels>>;
}) {
  const { role, specialty } = recommendFilters(seeker);

  // Nothing to go on yet — point at the profile instead of guessing.
  if (!role.length && !specialty.length) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <UserRoundCog className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h2 className="font-medium">Get roles matched to you</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Add your nursing role and specialties, and we will rank every job by how well it
                fits.
              </p>
            </div>
          </div>
          {/* HUB owns the editing surface now, so this is cross-origin and
              must be a plain anchor — next/link cannot client-route to another
              origin and would prefetch it for nothing. */}
          <a
            href={hubLink("/profile/career")}
            className="inline-flex h-10 shrink-0 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Complete your profile
          </a>
        </div>
      </section>
    );
  }

  // A wide-ish pool, then rank in memory. The RPC narrows to the right role and
  // specialty; the score is what decides the order, and it weighs signals
  // (country, employment type, experience) that no single query can rank on.
  const { results } = await searchPublishedJobs({
    role,
    specialty,
    sort: "recent",
    pageSize: 60,
  });

  const ranked = results
    .map((r) => ({ ...r, match: scoreJobMatch(r.job, seeker) }))
    .filter((r) => (r.match.percent ?? 0) >= RECOMMEND_THRESHOLD)
    .sort((a, b) => (b.match.percent ?? 0) - (a.match.percent ?? 0))
    .slice(0, 5);

  if (!ranked.length) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          Recommended for you
        </h2>
        <a href={hubLink("/profile/career")} className="text-xs text-muted-foreground underline hover:text-foreground">
          Tune your preferences
        </a>
      </div>
      <ul className="space-y-3">
        {ranked.map(({ job, employer, match }) => (
          <li key={job.id}>
            <JobCard job={job} employer={employer} labels={labels} match={match} />
          </li>
        ))}
      </ul>
    </section>
  );
}

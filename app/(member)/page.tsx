import Link from "next/link";
import {
  GraduationCap, Briefcase, Bot, School, BadgeCheck, Library, Calculator,
  HeartHandshake, ArrowRight, ShieldCheck, MapPin,
} from "lucide-react";
import { getCurrentUserProfile } from "@/lib/supabase/server";
import { hubLink } from "@/lib/hub";
import { listPublishedJobs, formatSalary } from "@/lib/cns/jobs";
import { getJobLabels } from "@/lib/cns/taxonomy";

export const dynamic = "force-dynamic";

/**
 * Central Nursing Systems home.
 *
 * The front door to every CNS system — learning, jobs, registry, resources and
 * the advanced systems (Nubo, LMS). Introduction, the system cards, then a
 * taste of live content (featured learning and jobs) so the page is never
 * empty on first visit.
 *
 * Positioning: UNN Hub is networking and community; CNS is the structured
 * academic + careers experience. This page has to read that way.
 */
const SYSTEMS = [
  { href: "/learn", icon: GraduationCap, title: "Learn",
    body: "Courses, university question banks, exam preparation, clinical learning and advanced learning systems." },
  { href: "/jobs", icon: Briefcase, title: "Jobs",
    body: "Verified nursing jobs, career opportunities and job applications." },
  { href: "/nubo", icon: Bot, title: "Nubo",
    body: "A personal companion for learning, planning, reminders, career support and daily guidance." },
  { href: "/lms", icon: School, title: "LMS",
    body: "Explore nursing courses and colleges from different countries through connected learning management systems." },
  // Opens HUB: the career profile, its documents and its consent switches are
  // one page there now, next to the profile they belong to.
  { href: hubLink("/profile/career"), external: true, icon: BadgeCheck, title: "Registry",
    body: "Create a professional nursing profile, securely store documents, complete verification and keep credentials updated." },
  { href: "/library", icon: Library, title: "Library",
    body: "Access nursing books, articles, guidelines, research, Nursepedia and clinical reference materials." },
  { href: "/resources", icon: Calculator, title: "Resources",
    body: "Use calculators, templates, checklists, clinical tools, downloads and career resources." },
  { href: "/services", icon: HeartHandshake, title: "Services",
    body: "Professional nursing services, guidance and support." },
];

export default async function CnsHomePage() {
  const [profile, jobs, labels] = await Promise.all([
    getCurrentUserProfile(),
    listPublishedJobs(),
    getJobLabels(),
  ]);

  const firstName = (profile?.full_name as string | undefined)?.split(" ")[0] ?? "there";
  const verified = profile?.verification_status === "verified";
  const featuredJobs = (jobs ?? []).slice(0, 4);

  return (
    <div className="space-y-12">
      {/* Introduction */}
      <section className="rounded-2xl border border-border bg-card p-6 sm:p-10">
        <p className="text-sm font-medium text-primary">Central Nursing Systems</p>
        <h1 className="mt-2 max-w-3xl text-2xl font-semibold sm:text-4xl">
          Welcome back, {firstName}
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground sm:text-lg">
          Access nursing courses, jobs, Registry, Nubo, resources, services and advanced learning
          systems — all in one place, with your UNN account.
        </p>
        {verified && (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <ShieldCheck className="h-4 w-4" /> Verified nurse
          </p>
        )}
      </section>

      {/* System cards */}
      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Systems
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SYSTEMS.map(({ href, external, icon: Icon, title, body }) => {
            // A card that leaves this origin is a plain anchor. next/link
            // cannot client-route across origins and would prefetch another
            // app for nothing — see the header of lib/hub.ts.
            const Card = external ? "a" : Link;
            return (
              <Card
                key={href}
                href={href}
                className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </span>
                <h3 className="mt-4 font-medium group-hover:text-primary">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Featured nursing jobs */}
      {featuredJobs.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Featured nursing jobs
            </h2>
            <Link href="/jobs" className="flex items-center gap-1 text-sm text-primary hover:underline">
              All jobs <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {featuredJobs.map(({ job, employer }) => {
              const country = job.country ? labels.country[job.country] ?? job.country : null;
              const where = [job.city, country].filter(Boolean).join(", ");
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.slug}`}
                  className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
                >
                  <h3 className="font-medium group-hover:text-primary">{job.title}</h3>
                  {employer && <p className="mt-0.5 text-sm text-muted-foreground">{employer.name}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {where && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {where}
                      </span>
                    )}
                    <span>{labels.employment_type[job.employment_type] ?? job.employment_type}</span>
                    <span>{formatSalary(job)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

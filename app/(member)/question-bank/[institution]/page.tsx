import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  Clock,
  GraduationCap,
  Lock,
  MapPin,
  Stethoscope,
} from "lucide-react";

/** One icon per course, positionally matched to COURSES. */
const COURSE_ICONS = [GraduationCap, Stethoscope, BookOpen, Award];
import { getInstitutionBySlug } from "@/lib/cns/question-bank";
import {
  ACCESS_COPY,
  BANK_DIRECTORY,
  COURSES,
  COURSE_PICKER_COPY,
  bankFooter,
} from "@/lib/cns/question-bank-content";

export const dynamic = "force-dynamic";

function findBank(slug: string) {
  for (const group of BANK_DIRECTORY) {
    const bank = group.banks.find((b) => b.key === slug);
    if (bank) return bank;
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ institution: string }> }) {
  const bank = findBank((await params).institution);
  return { title: `${bank?.name ?? "Question Bank"} — Central Nursing Systems` };
}

/**
 * One university: the course level.
 *
 * Two states share this route. A university with content (only RGUHS today)
 * gets the course picker. One of the other 21 directory entries gets the
 * partner-access panel — the same message the old site showed, minus its
 * client-side code check, which was decorative: the codes shipped in the page
 * source and the pages behind them verified nothing.
 *
 * Copy is verbatim from lib/cns/question-bank-content.ts.
 */
export default async function InstitutionCoursePage({
  params,
}: {
  params: Promise<{ institution: string }>;
}) {
  const { institution: slug } = await params;

  const bank = findBank(slug);
  if (!bank) notFound();

  const institution = await getInstitutionBySlug(slug);

  return (
    <div className="space-y-8">
      <Link
        href="/question-bank"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        {COURSE_PICKER_COPY.back}
      </Link>

      <header className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/[0.08] via-card to-card">
        <span aria-hidden className="block h-1.5 w-full bg-primary" />
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <GraduationCap className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {institution?.short_name ?? institution?.name ?? bank.name}
              </h1>
              <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {bank.location}
              </p>
            </div>
          </div>
          {institution && (
            <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
              {COURSE_PICKER_COPY.heroSubtitle}
            </p>
          )}
        </div>
      </header>

      {!institution ? (
        <section className="rounded-xl border border-border bg-card p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">{ACCESS_COPY.heading}</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{ACCESS_COPY.body}</p>
        </section>
      ) : (
        <>
          <section>
            <h2 className="text-xl font-semibold">{COURSE_PICKER_COPY.heading}</h2>
            <p className="mt-2 max-w-3xl text-muted-foreground">{COURSE_PICKER_COPY.subtitle}</p>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {COURSES.map((course, i) => {
              const CourseIcon = COURSE_ICONS[i] ?? GraduationCap;
              const live = course.available;

              const body = (
                <>
                  {/* A live course gets the brand bar; the rest stay neutral,
                      so "what can I actually open" is answerable before
                      reading a single badge. */}
                  <span
                    aria-hidden
                    className={`h-1.5 w-full ${live ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"}`}
                  />

                  <div className="flex flex-1 flex-col p-5">
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-inset ${
                        live
                          ? "bg-primary/10 text-primary ring-primary/20"
                          : "bg-muted text-muted-foreground ring-border"
                      }`}
                    >
                      <CourseIcon className="h-5 w-5" />
                    </span>

                    <h3
                      className={`mt-3 text-[15px] font-bold leading-snug ${
                        live ? "group-hover:text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {course.name}
                    </h3>
                    <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted-foreground">
                      {course.description}
                    </p>

                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                          live
                            ? "bg-success-soft text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {live ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {live
                          ? COURSE_PICKER_COPY.availableBadge
                          : COURSE_PICKER_COPY.unavailableBadge}
                      </span>
                      {live && (
                        <ArrowRight className="h-4 w-4 -translate-x-1 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                      )}
                    </div>
                  </div>
                </>
              );

              return live ? (
                <Link
                  key={course.key}
                  href={`/question-bank/${slug}/${course.key}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover"
                >
                  {body}
                </Link>
              ) : (
                <div
                  key={course.key}
                  aria-disabled
                  className="flex flex-col overflow-hidden rounded-2xl border border-dashed border-border bg-card/60"
                >
                  {body}
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="border-t border-border pt-6 text-center text-xs text-muted-foreground">
        {bankFooter(institution?.short_name ?? bank.name)}
      </p>
    </div>
  );
}

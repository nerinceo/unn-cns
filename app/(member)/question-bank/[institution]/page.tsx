import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, GraduationCap, Lock } from "lucide-react";
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
        <ArrowLeft className="h-4 w-4" />
        {COURSE_PICKER_COPY.back}
      </Link>

      <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <GraduationCap className="mt-0.5 h-7 w-7 shrink-0 text-primary" />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold sm:text-3xl">
              {institution?.short_name ?? institution?.name ?? bank.name}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{bank.location}</p>
          </div>
        </div>
        {institution && (
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {COURSE_PICKER_COPY.heroSubtitle}
          </p>
        )}
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

          <div className="grid gap-4 sm:grid-cols-2">
            {COURSES.map((course) => {
              const body = (
                <>
                  <h3 className="font-medium leading-snug">{course.name}</h3>
                  <p className="mt-2 flex-1 text-sm text-muted-foreground">{course.description}</p>
                  <span
                    className={`mt-4 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ${
                      course.available
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {course.available
                      ? COURSE_PICKER_COPY.availableBadge
                      : COURSE_PICKER_COPY.unavailableBadge}
                  </span>
                </>
              );

              return course.available ? (
                <Link
                  key={course.key}
                  href={`/question-bank/${slug}/${course.key}`}
                  className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
                >
                  {body}
                </Link>
              ) : (
                <div
                  key={course.key}
                  className="flex flex-col rounded-xl border border-border bg-card p-5 opacity-75"
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

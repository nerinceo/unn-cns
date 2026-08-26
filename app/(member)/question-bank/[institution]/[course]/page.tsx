import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { getInstitutionBySlug } from "@/lib/cns/question-bank";
import { getBankRollup, tallyBySemester } from "@/lib/cns/nursing-bank";
import {
  COURSES,
  SEMESTERS,
  SEMESTER_PICKER_COPY,
  bankFooter,
  questionCountLabel,
} from "@/lib/cns/question-bank-content";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ institution: string; course: string }>;
}) {
  const { institution, course } = await params;
  const inst = await getInstitutionBySlug(institution);
  const c = COURSES.find((x) => x.key === course);
  return {
    title: `${inst?.short_name ?? "Question Bank"} ${c?.name ?? ""} — Central Nursing Systems`.trim(),
  };
}

/**
 * One course: the semester level.
 *
 * The counts are live rather than the constants the old site's cards were
 * seeded with, so a card cannot drift from what opening it actually shows. Both
 * halves of the bank are counted — MCQs and written questions — because the
 * legacy per-semester numbers were the sum of the two.
 *
 * Copy is verbatim from lib/cns/question-bank-content.ts.
 */
export default async function CourseSemesterPage({
  params,
}: {
  params: Promise<{ institution: string; course: string }>;
}) {
  const { institution: slug, course: courseKey } = await params;

  const course = COURSES.find((c) => c.key === courseKey);
  if (!course || !course.available) notFound();

  const institution = await getInstitutionBySlug(slug);
  if (!institution) notFound();

  const rollup = await getBankRollup(institution.id);
  const counts = tallyBySemester(rollup);

  const base = `/question-bank/${slug}/${courseKey}`;

  return (
    <div className="space-y-8">
      <Link
        href={`/question-bank/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        {SEMESTER_PICKER_COPY.back}
      </Link>

      <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-0.5 h-7 w-7 shrink-0 text-primary" />
          <h1 className="text-2xl font-semibold sm:text-3xl">
            {institution.short_name ?? institution.name} {course.name}
          </h1>
        </div>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          {SEMESTER_PICKER_COPY.heroSubtitle}
        </p>
      </header>

      <section>
        <h2 className="text-xl font-semibold">{SEMESTER_PICKER_COPY.heading}</h2>
        <p className="mt-2 max-w-3xl text-muted-foreground">{SEMESTER_PICKER_COPY.subtitle}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SEMESTERS.map((sem) => {
          const total = counts.get(sem.number) ?? 0;

          return (
            <Link
              key={sem.number}
              href={`${base}/${sem.number}`}
              className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <h3 className="font-medium leading-snug group-hover:text-primary">{sem.name}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{sem.description}</p>

              <p className="mt-4 text-sm font-medium tabular-nums">
                {questionCountLabel(total)}
              </p>
              <span className="mt-2 inline-flex w-fit items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {SEMESTER_PICKER_COPY.badge}
              </span>
            </Link>
          );
        })}
      </div>

      <p className="border-t border-border pt-6 text-center text-xs text-muted-foreground">
        {bankFooter(`${institution.short_name ?? institution.name} ${course.name}`)}
      </p>
    </div>
  );
}

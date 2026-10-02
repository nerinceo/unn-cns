import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, Check, FileText } from "lucide-react";
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

/**
 * One colour per academic year, so the eight semester cards read as four
 * pairs rather than eight identical boxes. The year is derived from the
 * semester number — nothing is labelled with it, since the source's semester
 * picker carries no year text and the wording here must match it.
 */
const YEAR_BANDS = [
  { bar: "bg-blue-500", chip: "bg-blue-50 text-blue-700 ring-blue-600/20", icon: "text-blue-500" },
  { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", icon: "text-emerald-500" },
  { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-800 ring-amber-600/20", icon: "text-amber-500" },
  { bar: "bg-violet-500", chip: "bg-violet-50 text-violet-700 ring-violet-600/20", icon: "text-violet-500" },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ institution: string; course: string }>;
}) {
  const { institution, course } = await params;
  const inst = await getInstitutionBySlug(institution);
  const c = COURSES.find((x) => x.key === course);
  return {
    title: `${inst?.short_name ?? "Question Bank"} ${c?.name ?? ""} — Central Nerusalem Space`.trim(),
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

      <header className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/[0.08] via-card to-card">
        <span aria-hidden className="block h-1.5 w-full bg-primary" />
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <BookOpen className="h-6 w-6" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {institution.short_name ?? institution.name} {course.name}
            </h1>
          </div>
          <p className="mt-4 max-w-3xl text-[16px] leading-relaxed text-muted-foreground">
            {SEMESTER_PICKER_COPY.heroSubtitle}
          </p>
        </div>
      </header>

      <section>
        <h2 className="text-xl font-semibold">{SEMESTER_PICKER_COPY.heading}</h2>
        <p className="mt-2 max-w-3xl text-muted-foreground">{SEMESTER_PICKER_COPY.subtitle}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {SEMESTERS.map((sem) => {
          const total = counts.get(sem.number) ?? 0;
          const band = YEAR_BANDS[Math.ceil(sem.number / 2) - 1] ?? YEAR_BANDS[0];

          return (
            <Link
              key={sem.number}
              href={`${base}/${sem.number}`}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover"
            >
              {/* Colour bands the two semesters of each academic year together,
                  so the eight cards read as four pairs at a glance. */}
              <span aria-hidden className={`h-1.5 w-full ${band.bar}`} />

              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold tabular-nums ring-1 ring-inset ${band.chip}`}
                  >
                    {sem.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[16px] font-bold leading-snug group-hover:text-primary">
                      {sem.name}
                    </h3>
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-success">
                      <Check className="h-3 w-3" />
                      {SEMESTER_PICKER_COPY.badge}
                    </span>
                  </div>
                </div>

                <p className="mt-3 flex-1 text-[14px] leading-relaxed text-muted-foreground">
                  {sem.description}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <span className="inline-flex items-center gap-1.5 text-[14px] font-bold tabular-nums text-foreground">
                    <FileText className={`h-4 w-4 ${band.icon}`} />
                    {questionCountLabel(total)}
                  </span>
                  <ArrowRight className="h-4 w-4 -translate-x-1 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </div>
              </div>
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

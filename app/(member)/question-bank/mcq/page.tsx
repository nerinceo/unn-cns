import Link from "next/link";
import { Clock, FileText, Lock, X } from "lucide-react";
import { getSubjectsWithSets } from "@/lib/cns/question-bank";
import { BankHeader } from "@/components/question-bank/BankHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "MCQs — Question Bank — Central Nursing Systems" };

/**
 * MCQ half of the bank: auto-graded practice sets and past papers.
 *
 * Every subject currently carries one practice set, so a section-per-subject
 * layout left most of a wide screen empty. Instead: flatten to one card per
 * set, grouped by year of study, in a dense responsive grid.
 *
 * ?subject=<id> narrows to a single subject — that is where the overview's
 * "3 practice sets" link lands when a subject has more than one.
 */
export default async function McqPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject: subjectId } = await searchParams;
  const allSubjects = await getSubjectsWithSets();

  // Filter in memory: the reader already loaded every published set, and a
  // stale id should degrade to "nothing here", not to an unfiltered page.
  const filtered = subjectId ? allSubjects.filter((s) => s.id === subjectId) : allSubjects;
  const activeSubject = subjectId ? allSubjects.find((s) => s.id === subjectId) : undefined;

  type Card = { subject: (typeof allSubjects)[number]; set: (typeof allSubjects)[number]["sets"][number] };
  const byYear = new Map<number, Card[]>();
  for (const subject of filtered) {
    for (const set of subject.sets) {
      const y = subject.year_of_study ?? 0;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push({ subject, set });
    }
  }
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);
  const totalSets = filtered.reduce((n, s) => n + s.sets.length, 0);

  return (
    <div className="space-y-10">
      <BankHeader
        active="mcq"
        description={`Timed, auto-graded practice sets and past papers across ${allSubjects.length} subjects. Answers and explanations are revealed after you submit.`}
      />

      {subjectId && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Showing {activeSubject?.name ?? "this subject"}
          </span>
          <Link
            href="/question-bank/mcq"
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <X className="h-3.5 w-3.5" /> Clear filter
          </Link>
        </div>
      )}

      {totalSets === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="font-medium">No published sets{subjectId ? " for this subject" : " yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {subjectId
              ? "Try clearing the filter, or check the Revision tab for written questions."
              : "Question sets appear here once staff publish them."}
          </p>
        </div>
      ) : (
        years.map((year) => (
          <section key={year}>
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {year ? `Year ${year}` : "General"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {byYear.get(year)!.map(({ subject, set }) => {
                const locked = set.access_type === "entitled";
                return (
                  <Link
                    key={set.id}
                    href={`/question-bank/set/${set.id}`}
                    className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 font-medium leading-snug group-hover:text-primary">
                        {subject.name}
                      </h3>
                      {locked && <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                    </div>
                    {subject.semester != null && (
                      <p className="mt-0.5 text-xs text-muted-foreground">Semester {subject.semester}</p>
                    )}
                    <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        <span className="capitalize">{set.set_type.replace(/_/g, " ")}</span>
                      </div>
                      {set.duration_minutes && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {set.duration_minutes} min
                        </div>
                      )}
                      {set.total_marks != null && <div>{set.total_marks} marks</div>}
                    </dl>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

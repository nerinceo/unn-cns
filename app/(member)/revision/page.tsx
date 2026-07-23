import Link from "next/link";
import { BookOpenCheck, ArrowRight } from "lucide-react";
import { getStudySubjects } from "@/lib/cns/study";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revision — UNN CNS" };

export default async function RevisionPage() {
  const subjects = await getStudySubjects();

  // Group by year of study so a nurse sees their year's subjects together.
  const byYear = new Map<number, typeof subjects>();
  for (const s of subjects) {
    const y = s.year_of_study ?? 0;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(s);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <BookOpenCheck className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">Revision</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Exam-style questions with model answers — essays, viva, case scenarios and care plans.
          Read the question, work it through, then reveal the model answer to check yourself.
        </p>
      </header>

      {subjects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No revision questions yet</p>
          <p className="mt-1 text-sm text-muted-foreground">They appear here once staff publish them.</p>
        </div>
      ) : (
        years.map((year) => (
          <section key={year}>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {year ? `Year ${year}` : "General"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {byYear.get(year)!.map((s) => (
                <Link
                  key={s.id}
                  href={`/revision/${s.id}`}
                  className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary"
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-medium group-hover:text-primary">{s.name}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {s.count} {s.count === 1 ? "question" : "questions"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

import Link from "next/link";
import { ClipboardList, Clock, FileText, Lock } from "lucide-react";
import { getSubjectsWithSets } from "@/lib/cns/question-bank";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question Bank — UNN CNS" };

export default async function QuestionBankPage() {
  const subjects = await getSubjectsWithSets();

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <ClipboardList className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">Question Bank</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Practice sets and past papers. Answers and explanations are revealed after you submit.
        </p>
      </header>

      {subjects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No published sets yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Question sets appear here once staff publish them.
          </p>
        </div>
      ) : (
        subjects.map((subject) => (
          <section key={subject.id}>
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="text-lg font-medium">{subject.name}</h2>
              {subject.year_of_study && (
                <span className="text-xs text-muted-foreground">
                  Year {subject.year_of_study}
                  {subject.semester ? ` · Semester ${subject.semester}` : ""}
                </span>
              )}
            </div>
            {subject.description && (
              <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{subject.description}</p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {subject.sets.map((set) => {
                const locked = set.access_type === "entitled";
                return (
                  <Link
                    key={set.id}
                    href={`/question-bank/set/${set.id}`}
                    className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-medium group-hover:text-primary">{set.title}</h3>
                      {locked && <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                    </div>
                    {set.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{set.description}</p>
                    )}
                    <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
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

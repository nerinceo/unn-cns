import Link from "next/link";
import { ClipboardList, GraduationCap, FileText, BookOpenCheck, Layers, ArrowRight } from "lucide-react";
import { getInstitutionsWithBank } from "@/lib/cns/question-bank";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question Bank — Central Nursing Systems" };

/** Country codes seen on institutions. Expanded as universities are added. */
const COUNTRY: Record<string, string> = { IN: "India" };

/**
 * Question Bank root — the university level.
 *
 * Every question in CNS belongs to a university's syllabus: the subject list,
 * the year/semester split and the exam formats are all RGUHS B.Sc Nursing
 * specific. Presenting the bank as a flat list of subjects hid that, so a
 * student from another university had no way to tell this was not their course.
 * The bank now opens on whose bank it is.
 *
 * With one university this costs a click, so each card carries direct MCQ and
 * Descriptive links — the drill-in is a shortcut, not a toll gate.
 */
export default async function QuestionBankPage() {
  const institutions = await getInstitutionsWithBank();

  return (
    <div className="space-y-10">
      <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold sm:text-3xl">Question Bank</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Question banks are organised by university. Open yours for auto-graded MCQ practice sets
          and descriptive questions — essays, viva, case scenarios and care plans, each with a model
          answer — mapped to its syllabus.
        </p>
      </header>

      {institutions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="font-medium">No question banks yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Universities appear here once staff publish their content.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {institutions.map((inst) => {
            const base = `/question-bank/${inst.slug}`;
            const country = COUNTRY[inst.country] ?? inst.country;
            const empty = inst.setCount === 0 && inst.descriptiveCount === 0;

            return (
              <section key={inst.id} className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <GraduationCap className="h-6 w-6 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={base} className="group">
                      <h2 className="text-lg font-semibold group-hover:text-primary">
                        {inst.short_name ?? inst.name}
                      </h2>
                      {inst.short_name && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{inst.name}</p>
                      )}
                    </Link>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {[
                        inst.programs.map((p) =>
                          p.duration_years ? `${p.name} · ${p.duration_years} years` : p.name
                        ).join(" · "),
                        country,
                      ]
                        .filter(Boolean)
                        .join(" — ")}
                    </p>
                  </div>
                </div>

                {empty ? (
                  <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
                    Nothing published yet.
                  </p>
                ) : (
                  <>
                    <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-4">
                      <Stat icon={Layers} value={inst.subjectCount} label="Subjects" />
                      <Stat icon={FileText} value={inst.setCount} label="Practice sets" />
                      <Stat icon={BookOpenCheck} value={inst.descriptiveCount} label="Descriptive questions" />
                    </dl>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        href={base}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                      >
                        Open bank <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      {inst.setCount > 0 && (
                        <Link
                          href={`${base}/mcq`}
                          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
                        >
                          <FileText className="h-4 w-4" /> MCQs
                        </Link>
                      )}
                      {inst.descriptiveCount > 0 && (
                        <Link
                          href={`${base}/descriptive`}
                          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
                        >
                          <BookOpenCheck className="h-4 w-4" /> Descriptive
                        </Link>
                      )}
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Layers; value: number; label: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}

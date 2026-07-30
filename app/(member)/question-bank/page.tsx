import Link from "next/link";
import { BookOpenCheck, FileText, ArrowRight, Lock } from "lucide-react";
import { getBankSubjects } from "@/lib/cns/question-bank";
import { BankHeader } from "@/components/question-bank/BankHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question Bank — Central Nursing Systems" };

/**
 * Question Bank overview — subject first, format second.
 *
 * A nurse revising Pharmacology wants everything for Pharmacology, not a
 * decision about which of two products to open. So the landing page is one card
 * per subject carrying both counts, and the format tabs above are the shortcut
 * for someone who does know they want MCQs (or written answers) specifically.
 */
export default async function QuestionBankPage() {
  const subjects = await getBankSubjects();

  const byYear = new Map<number, typeof subjects>();
  for (const s of subjects) {
    const y = s.year_of_study ?? 0;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(s);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);

  const totalSets = subjects.reduce((n, s) => n + s.sets.length, 0);
  const totalRevision = subjects.reduce((n, s) => n + s.revisionCount, 0);

  return (
    <div className="space-y-10">
      <BankHeader
        active="overview"
        description="Every question for your course in one place — auto-graded MCQ practice sets and written exam questions with model answers, organised by subject."
      />

      {/* The two formats, with what is actually in each. */}
      <section className="grid gap-4 sm:grid-cols-2">
        <FormatCard
          href="/question-bank/mcq"
          icon={FileText}
          title="MCQs"
          count={`${totalSets} ${totalSets === 1 ? "practice set" : "practice sets"}`}
          body="Timed, auto-graded sets and past papers. Answers and explanations are revealed after you submit, and your accuracy feeds Progress."
        />
        <FormatCard
          href="/question-bank/revision"
          icon={BookOpenCheck}
          title="Revision"
          count={`${totalRevision.toLocaleString()} ${totalRevision === 1 ? "question" : "questions"}`}
          body="Essays, viva, case scenarios and care plans. Work the question through, then reveal the model answer to check yourself."
        />
      </section>

      {subjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="font-medium">Nothing published yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Questions appear here once staff publish them.
          </p>
        </div>
      ) : (
        years.map((year) => (
          <section key={year}>
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {year ? `Year ${year}` : "General"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {byYear.get(year)!.map((s) => {
                // One set is the common case, so skip the redundant list page
                // and send the learner straight into it.
                const mcqHref =
                  s.sets.length === 1
                    ? `/question-bank/set/${s.sets[0].id}`
                    : `/question-bank/mcq?subject=${s.id}`;
                const locked = s.sets.some((set) => set.access_type === "entitled");

                return (
                  <div
                    key={s.id}
                    className="flex flex-col rounded-xl border border-border bg-card p-5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 font-medium leading-snug">{s.name}</h3>
                      {locked && <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                    </div>
                    {s.semester != null && (
                      <p className="mt-0.5 text-xs text-muted-foreground">Semester {s.semester}</p>
                    )}

                    <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
                      {s.sets.length > 0 ? (
                        <SubjectLink
                          href={mcqHref}
                          icon={FileText}
                          label={`${s.sets.length} ${s.sets.length === 1 ? "practice set" : "practice sets"}`}
                        />
                      ) : (
                        <p className="flex items-center gap-2 py-1 text-muted-foreground/60">
                          <FileText className="h-4 w-4 shrink-0" /> No practice sets
                        </p>
                      )}
                      {s.revisionCount > 0 ? (
                        <SubjectLink
                          href={`/question-bank/revision/${s.id}`}
                          icon={BookOpenCheck}
                          label={`${s.revisionCount.toLocaleString()} revision ${s.revisionCount === 1 ? "question" : "questions"}`}
                        />
                      ) : (
                        <p className="flex items-center gap-2 py-1 text-muted-foreground/60">
                          <BookOpenCheck className="h-4 w-4 shrink-0" /> No revision questions
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function FormatCard({
  href,
  icon: Icon,
  title,
  count,
  body,
}: {
  href: string;
  icon: typeof FileText;
  title: string;
  count: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-6 w-6 text-primary" />
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h2 className="font-medium group-hover:text-primary">{title}</h2>
          <span className="text-sm text-muted-foreground">{count}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </Link>
  );
}

function SubjectLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 py-1 text-muted-foreground transition-colors hover:text-primary"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

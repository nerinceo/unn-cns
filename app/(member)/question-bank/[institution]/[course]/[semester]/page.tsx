import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { getInstitutionBySlug } from "@/lib/cns/question-bank";
import {
  getBankRollup,
  getSemesterQuestions,
  getSemesterTypes,
  getTopicIndex,
  subjectsInSemester,
} from "@/lib/cns/nursing-bank";
import { NursingBankCard } from "@/components/question-bank/NursingBankCard";
import {
  COURSES,
  DISCLAIMER,
  QUESTION_LIST_COPY,
  SEMESTERS,
  bankFooter,
  countPillLabel,
  questionListTitle,
  showingLabel,
  subjectOptionLabel,
} from "@/lib/cns/question-bank-content";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ institution: string; course: string; semester: string }>;
}) {
  const { semester } = await params;
  return { title: `Questions — Semester ${semester} — Central Nursing Systems` };
}

/**
 * One semester's questions — the legacy questions.html rebuilt.
 *
 * Filters are links rather than a client-side store: the old page refetched on
 * every filter change anyway, and server-rendered filters keep a filtered view
 * shareable and back-button-correct.
 *
 * MCQs are counted on the semester card but are not listed here. Their answer
 * key is revoked from `authenticated` at the column level and is only readable
 * through `cns_attempt_review` after an attempt is submitted, so an inline
 * "Show Answer" over them would render blanks. They are surfaced as a link into
 * the practice-set flow instead.
 *
 * Copy is verbatim from lib/cns/question-bank-content.ts.
 */
export default async function SemesterQuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ institution: string; course: string; semester: string }>;
  searchParams: Promise<{ subject?: string; type?: string; q?: string; page?: string }>;
}) {
  const { institution: slug, course: courseKey, semester: semesterParam } = await params;
  const sp = await searchParams;

  const course = COURSES.find((c) => c.key === courseKey);
  if (!course || !course.available) notFound();

  const semesterNumber = Number(semesterParam);
  const semester = SEMESTERS.find((s) => s.number === semesterNumber);
  if (!semester) notFound();

  const institution = await getInstitutionBySlug(slug);
  if (!institution) notFound();

  const rollup = await getBankRollup(institution.id);
  const subjects = subjectsInSemester(rollup, semesterNumber);
  const subjectIds = subjects.map((s) => s.id);

  // A subject filter from another semester would silently widen the view.
  const selectedSubject = sp.subject && subjectIds.includes(sp.subject) ? sp.subject : undefined;
  const selectedType = sp.type || undefined;
  const search = sp.q?.trim() || undefined;
  const page = Number(sp.page ?? 0) || 0;

  const [types, { questions, total, pageSize }, topicIdx] = await Promise.all([
    getSemesterTypes(subjectIds),
    getSemesterQuestions({
      institutionId: institution.id,
      subjectIds,
      subjectId: selectedSubject,
      type: selectedType,
      search,
      page,
    }),
    getTopicIndex(subjectIds),
  ]);

  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));

  const base = `/question-bank/${slug}/${courseKey}/${semesterNumber}`;
  const href = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { subject: selectedSubject, type: selectedType, q: search, ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== "") p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  const shown = Math.min((page + 1) * pageSize, total);
  const pages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <Link
        href={`/question-bank/${slug}/${courseKey}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        {QUESTION_LIST_COPY.back}
      </Link>

      <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold sm:text-3xl">
          {questionListTitle(
            institution.short_name ?? institution.name,
            course.name,
            semesterNumber
          )}
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{QUESTION_LIST_COPY.subtitle}</p>
      </header>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-primary">{QUESTION_LIST_COPY.filterHeading}</h2>

        <form action={base} method="get" className="mt-3 flex flex-wrap gap-3">
          {selectedSubject && <input type="hidden" name="subject" value={selectedSubject} />}
          {selectedType && <input type="hidden" name="type" value={selectedType} />}
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              name="q"
              defaultValue={search ?? ""}
              placeholder={QUESTION_LIST_COPY.searchPlaceholder}
              className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {QUESTION_LIST_COPY.filterHeading}
          </button>
        </form>

        {/* Subject rail — the old page's chips, with true counts. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <FilterChip href={href({ subject: undefined, page: undefined })} active={!selectedSubject}>
            {QUESTION_LIST_COPY.allSubjects}
          </FilterChip>
          {subjects.map((s) => (
            <FilterChip
              key={s.id}
              href={href({ subject: s.id, page: undefined })}
              active={selectedSubject === s.id}
            >
              {subjectOptionLabel(s.name, s.total)}
            </FilterChip>
          ))}
        </div>

        {types.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterChip href={href({ type: undefined, page: undefined })} active={!selectedType}>
              {QUESTION_LIST_COPY.allTypes}
            </FilterChip>
            {types.map((t) => (
              <FilterChip
                key={t.type}
                href={href({ type: t.type, page: undefined })}
                active={selectedType === t.type}
              >
                {t.type} <span className="opacity-70">{t.count}</span>
              </FilterChip>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-sm">
          <span className="text-muted-foreground">
            {total > 0 ? showingLabel(shown, total) : QUESTION_LIST_COPY.exhausted}
          </span>
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs tabular-nums">
            {countPillLabel(total)}
          </span>
        </div>
      </section>

      {questions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-muted-foreground">{QUESTION_LIST_COPY.empty}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => {
            const t = q.topic_id ? topicIdx.get(q.topic_id) : undefined;
            return (
              <NursingBankCard
                key={q.id}
                id={q.id}
                href={`${base}/q/${q.id}`}
                stem={q.stem}
                modelAnswer={q.model_answer}
                rationale={q.rationale}
                examTip={q.exam_tip}
                diagramNote={q.diagram_note}
                type={q.source_question_type}
                marks={q.marks}
                subjectName={subjectName.get(q.subject_id) ?? null}
                unitName={t?.unitName ?? null}
                topicName={t?.name ?? null}
                optionA={q.option_a}
                optionB={q.option_b}
                optionC={q.option_c}
                optionD={q.option_d}
                correctOption={q.correct_option}
              />
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between border-t border-border pt-4 text-sm">
          {page > 0 ? (
            <Link
              href={href({ page: page - 1 })}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {page + 1} of {pages}
          </span>
          {page < pages - 1 ? (
            <Link
              href={href({ page: page + 1 })}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {QUESTION_LIST_COPY.loadMore} <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <p className="rounded-xl border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
        <strong className="font-semibold">{DISCLAIMER.label}</strong> {DISCLAIMER.body}
      </p>

      <p className="text-center text-xs text-muted-foreground">
        {bankFooter(`${institution.short_name ?? institution.name} ${course.name}`)}
      </p>
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-primary"
      }`}
    >
      {children}
    </Link>
  );
}

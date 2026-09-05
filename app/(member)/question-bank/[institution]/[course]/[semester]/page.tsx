import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  Search,
  SearchX,
  SlidersHorizontal,
} from "lucide-react";
import { FilterSelect } from "@/components/question-bank/FilterSelect";
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
 * MCQs are listed here alongside every other type, options and correct answer
 * included. They are read from cns_study_questions — the browse copies, whose
 * answers are plain readable columns. The originals in cns_questions keep their
 * answer key revoked from `authenticated`, which is why the two copies exist;
 * only the browse half can be shown inline.
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
    // Full width of the shell. Layout width and reading width are separate
    // problems: the cards fill the page, and the stem and answer bodies cap
    // their own measure so long prose never runs the full 1440px.
    <div className="space-y-5">
      <Link
        href={`/question-bank/${slug}/${courseKey}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        {QUESTION_LIST_COPY.back}
      </Link>

      <header className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border bg-gradient-to-br from-primary/[0.07] via-card to-card p-6 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {questionListTitle(
              institution.short_name ?? institution.name,
              course.name,
              semesterNumber
            )}
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
            {QUESTION_LIST_COPY.subtitle}
          </p>
        </div>
      </header>

      {/* NOT overflow-hidden, despite the rounded corners.
          FilterSelect opens an absolutely-positioned panel, and `overflow`
          clips absolutely-positioned descendants — so the dropdowns opened
          into a clipped region and appeared to do nothing at all. The tinted
          header rounds its own top corners instead, which is all the clipping
          was doing here. */}
      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 rounded-t-xl border-b border-border bg-primary/[0.06] px-5 py-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-primary">
            {QUESTION_LIST_COPY.filterHeading}
          </h2>
        </div>
        <div className="p-5 pt-0">

        {/* Search and both filters on one line. The source filtered on subject
            and type too; as dropdowns rather than rails, because eleven types
            and eight subjects as chips pushed the first question below three
            rows of wrapping. Search submits on Enter, and the icon button
            borrows the placeholder for its accessible name rather than
            introducing a word the source does not have. */}
        <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
          <form action={base} method="get" className="relative min-w-0 flex-1">
            {selectedSubject && <input type="hidden" name="subject" value={selectedSubject} />}
            {selectedType && <input type="hidden" name="type" value={selectedType} />}
            <input
              type="text"
              name="q"
              defaultValue={search ?? ""}
              placeholder={QUESTION_LIST_COPY.searchPlaceholder}
              className="h-11 w-full rounded-xl border border-border bg-background pl-4 pr-12 text-sm text-foreground outline-none transition-shadow placeholder:text-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/15 dark:placeholder:text-slate-400"
            />
            <button
              type="submit"
              aria-label={QUESTION_LIST_COPY.searchPlaceholder}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>

          <FilterSelect
            variant="subject"
            allLabel={QUESTION_LIST_COPY.allSubjects}
            allHref={href({ subject: undefined, page: undefined })}
            widthClass="w-[19rem]"
            options={subjects.map((s) => ({
              label: subjectOptionLabel(s.name, s.total),
              href: href({ subject: s.id, page: undefined }),
              active: selectedSubject === s.id,
            }))}
          />
          {types.length > 1 && (
            <FilterSelect
              variant="type"
              allLabel={QUESTION_LIST_COPY.allTypes}
              allHref={href({ type: undefined, page: undefined })}
              options={types.map((t) => ({
                label: t.type,
                count: t.count,
                href: href({ type: t.type, page: undefined }),
                active: selectedType === t.type,
              }))}
            />
          )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">
          {total > 0 ? showingLabel(shown, total) : QUESTION_LIST_COPY.exhausted}
        </span>
        <span className="rounded-full bg-primary px-3 py-1 text-[12px] font-bold tabular-nums text-primary-foreground">
          {countPillLabel(total)}
        </span>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="mt-3 text-[15px] font-medium text-slate-700 dark:text-slate-300">
            {QUESTION_LIST_COPY.empty}
          </p>
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
        <nav className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-[13px]">
          {page > 0 ? (
            <Link
              href={href({ page: page - 1 })}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary dark:text-slate-300"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="font-medium tabular-nums text-slate-600 dark:text-slate-400">
            Page {page + 1} of {pages}
          </span>
          {page < pages - 1 ? (
            <Link
              href={href({ page: page + 1 })}
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-4 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {QUESTION_LIST_COPY.loadMore} <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/25 dark:bg-amber-500/10">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <p className="text-[12.5px] leading-relaxed text-amber-900 dark:text-amber-200/90">
          <strong className="font-bold">{DISCLAIMER.label}</strong> {DISCLAIMER.body}
        </p>
      </div>

      <p className="pb-2 text-center text-[12px] font-medium text-slate-500 dark:text-slate-400">
        {bankFooter(`${institution.short_name ?? institution.name} ${course.name}`)}
      </p>
    </div>
  );
}


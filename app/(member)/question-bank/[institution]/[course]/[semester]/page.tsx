import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  Lock,
  Search,
  SearchX,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { FilterSelect } from "@/components/question-bank/FilterSelect";
import { getInstitutionBySlug } from "@/lib/cns/question-bank";
import { semesterMode } from "@/lib/cns/qbank-access";
import {
  SAMPLE_SIZE,
  browseSemesterQuestions,
  getBankRollup,
  getSemesterMarks,
  getSemesterSample,
  getSemesterTypes,
  getTopicIndex,
  subjectsInSemester,
  type TopicLabel,
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
  return { title: `Questions — Semester ${semester} — Central Nerusalem Space` };
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { institution: slug, course: courseKey, semester: semesterParam } = await params;
  const sp = await searchParams;

  const course = COURSES.find((c) => c.key === courseKey);
  if (!course || !course.available) notFound();

  const semesterNumber = Number(semesterParam);
  const semester = SEMESTERS.find((s) => s.number === semesterNumber);
  if (!semester) notFound();

  // Paid access (0080) — decided before a single question is fetched: the
  // whole semester if bought, otherwise its 10 free samples (2026-10-13).
  const { access, mode } = await semesterMode(slug, courseKey, semesterNumber);
  const sample = mode === "sample";

  const institution = await getInstitutionBySlug(slug);
  if (!institution) notFound();

  const rollup = await getBankRollup(institution.id);
  const subjects = subjectsInSemester(rollup, semesterNumber);
  const subjectIds = subjects.map((s) => s.id);
  const semesterTotal = subjects.reduce((n, s) => n + s.total, 0);

  // Every filter takes several values (?subject=a&subject=b). Values from
  // another semester would silently widen the view, so they are dropped.
  const many = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);
  };
  const selectedSubjects = many("subject").filter((s) => subjectIds.includes(s));
  const selectedTypes = many("type");
  const selectedMarks = many("marks").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  // Topics belong to the chosen subjects (every subject's would be hundreds),
  // so the topic filter appears once a subject is picked.
  const subjectTopics = !sample && selectedSubjects.length ? await getTopicIndex(selectedSubjects) : new Map<string, TopicLabel>();
  const selectedTopics = many("topic").filter((t) => subjectTopics.has(t));
  const qParam = sp.q;
  const search = (Array.isArray(qParam) ? qParam[0] : qParam)?.trim() || undefined;
  const pageParam = sp.page;
  const page = sample ? 0 : Number(Array.isArray(pageParam) ? pageParam[0] : pageParam ?? 0) || 0;

  const [types, marks, listing, topicIdx] = await Promise.all([
    sample ? Promise.resolve([]) : getSemesterTypes(subjectIds),
    sample ? Promise.resolve([]) : getSemesterMarks(subjectIds),
    sample
      ? getSemesterSample(subjectIds).then((questions) => ({ questions, total: questions.length, page: 0, pageSize: SAMPLE_SIZE }))
      : browseSemesterQuestions({
          institutionId: institution.id,
          subjectIds,
          filters: { subjects: selectedSubjects, types: selectedTypes, marks: selectedMarks, topics: selectedTopics, search },
          page,
        }),
    getTopicIndex(subjectIds),
  ]);
  const { questions, total, pageSize } = listing;

  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));

  const base = `/question-bank/${slug}/${courseKey}/${semesterNumber}`;
  type Current = { subject: string[]; type: string[]; marks: string[]; topic: string[]; q?: string; page?: number };
  const current: Current = {
    subject: selectedSubjects,
    type: selectedTypes,
    marks: selectedMarks.map(String),
    topic: selectedTopics,
    q: search,
  };
  const href = (patch: Partial<Current>) => {
    const next = { ...current, page: undefined, ...patch };
    const p = new URLSearchParams();
    for (const k of ["subject", "type", "marks", "topic"] as const) for (const v of next[k]) p.append(k, v);
    if (next.q) p.set("q", next.q);
    if (next.page) p.set("page", String(next.page));
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  /** The same filters with `value` switched on or off — and topics cleared when subjects change. */
  const toggle = (k: "subject" | "type" | "marks" | "topic", value: string) => {
    const list = current[k].includes(value) ? current[k].filter((v) => v !== value) : [...current[k], value];
    return href(k === "subject" ? { subject: list, topic: [] } : { [k]: list });
  };

  const topicOptions = Array.from(subjectTopics.entries())
    .map(([key, t]) => ({ key, label: t.unitName ? `${t.unitName} · ${t.name}` : t.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

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
          <p className="mt-2 max-w-2xl text-[16px] leading-relaxed text-slate-600 dark:text-slate-400">
            {QUESTION_LIST_COPY.subtitle}
          </p>
        </div>
      </header>

      {/* Free samples (2026-10-13): what this is, and the way to the rest. */}
      {sample && (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[15px] font-bold text-foreground">
                Free sample · {questions.length} of {semesterTotal.toLocaleString("en-IN")} questions in Semester {semesterNumber}
              </p>
              <p className="mt-0.5 text-[14px] text-muted-foreground">
                Answers included. Buy this semester or the whole bank to read every question, with filters and search.
              </p>
            </div>
          </div>
          {access.buyUrl && (
            <a
              href={access.buyUrl}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Lock className="h-4 w-4" /> Buy Semester {semesterNumber} or the whole bank
            </a>
          )}
        </div>
      )}

      {/* Filters and search are for buyers; a sample shows its fixed 10 only.
          NOT overflow-hidden, despite the rounded corners: FilterSelect opens
          an absolutely-positioned panel, and `overflow` clips absolutely-
          positioned descendants — the dropdowns would open into a clipped
          region and appear to do nothing. */}
      {!sample && (
      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 rounded-t-xl border-b border-border bg-primary/[0.06] px-5 py-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-[14px] font-bold uppercase tracking-wide text-primary">
            {QUESTION_LIST_COPY.filterHeading}
          </h2>
          {(selectedSubjects.length + selectedTypes.length + selectedMarks.length + selectedTopics.length > 0 || search) && (
            <Link href={base} scroll={false} className="ml-auto text-[13px] font-semibold text-primary hover:underline">
              Clear all
            </Link>
          )}
        </div>
        <div className="p-5 pt-0">

        {/* Search, then four filters that each take several values
            (2026-10-13): tick Anatomy + Physiology, MCQ + Short Essay, 5 + 10
            marks. Search submits on Enter and keeps every ticked filter. */}
        <div className="mt-3 flex flex-col gap-2">
          <form action={base} method="get" className="relative min-w-0 flex-1">
            {selectedSubjects.map((v) => <input key={`s${v}`} type="hidden" name="subject" value={v} />)}
            {selectedTypes.map((v) => <input key={`t${v}`} type="hidden" name="type" value={v} />)}
            {selectedMarks.map((v) => <input key={`m${v}`} type="hidden" name="marks" value={v} />)}
            {selectedTopics.map((v) => <input key={`p${v}`} type="hidden" name="topic" value={v} />)}
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

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <FilterSelect
              variant="subject"
              noun="subjects"
              allLabel={QUESTION_LIST_COPY.allSubjects}
              allHref={href({ subject: [], topic: [] })}
              widthClass="w-[19rem]"
              options={subjects.map((s) => ({
                label: subjectOptionLabel(s.name, s.total),
                href: toggle("subject", s.id),
                active: selectedSubjects.includes(s.id),
              }))}
            />
            {types.length > 1 && (
              <FilterSelect
                variant="type"
                noun="types"
                allLabel={QUESTION_LIST_COPY.allTypes}
                allHref={href({ type: [] })}
                options={types.map((t) => ({
                  label: t.type,
                  count: t.count,
                  href: toggle("type", t.type),
                  active: selectedTypes.includes(t.type),
                }))}
              />
            )}
            {marks.length > 1 && (
              <FilterSelect
                variant="marks"
                noun="marks values"
                allLabel="All marks"
                allHref={href({ marks: [] })}
                widthClass="w-56"
                options={marks.map((m) => ({
                  label: `${m.marks} mark${m.marks === 1 ? "" : "s"}`,
                  count: m.count,
                  href: toggle("marks", String(m.marks)),
                  active: selectedMarks.includes(m.marks),
                }))}
              />
            )}
            {topicOptions.length > 0 && (
              <FilterSelect
                variant="topic"
                noun="topics"
                allLabel="All topics"
                allHref={href({ topic: [] })}
                widthClass="w-[22rem]"
                options={topicOptions.map((t) => ({
                  label: t.label,
                  href: toggle("topic", t.key),
                  active: selectedTopics.includes(t.key),
                }))}
              />
            )}
          </div>
          {selectedSubjects.length === 0 && (
            <p className="text-[12.5px] text-muted-foreground">Pick a subject to filter by its units and topics.</p>
          )}
        </div>
        </div>
      </section>
      )}

      {!sample && <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] font-semibold text-slate-700 dark:text-slate-300">
          {total > 0 ? showingLabel(shown, total) : QUESTION_LIST_COPY.exhausted}
        </span>
        <span className="rounded-full bg-primary px-3 py-1 text-[13px] font-bold tabular-nums text-primary-foreground">
          {countPillLabel(total)}
        </span>
      </div>}

      {questions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="mt-3 text-[16px] font-medium text-slate-700 dark:text-slate-300">
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
        <nav className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-[14px]">
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
        <p className="text-[13.5px] leading-relaxed text-amber-900 dark:text-amber-200/90">
          <strong className="font-bold">{DISCLAIMER.label}</strong> {DISCLAIMER.body}
        </p>
      </div>

      <p className="pb-2 text-center text-[13px] font-medium text-slate-500 dark:text-slate-400">
        {bankFooter(`${institution.short_name ?? institution.name} ${course.name}`)}
      </p>
    </div>
  );
}


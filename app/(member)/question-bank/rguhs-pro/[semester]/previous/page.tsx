import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, History, SearchX } from "lucide-react";
import {
  PRO_HOME,
  REPEAT_PATTERNS,
  gatedRead,
  getMarks,
  getProgress,
  getYearOptions,
  parseSemester,
  parseYears,
  questionOptions,
  recordResume,
  requireProBank,
  requireSemesterMode,
  type RepeatPattern,
} from "@/lib/cns/qbank-pro";
import { ProgressBar } from "@/components/question-bank/pro/Progress";
import { YearFilters } from "@/components/question-bank/pro/YearFilters";
import { formatAnswer } from "@/lib/cns/qbank-pro-format";
import {
  PRO_NAME,
  ProBack,
  ProCountBar,
  ProFooter,
  ProHeader,
  ProPager,
  ProSampleNotice,
  ProSearch,
  linkBuilder,
  pageParam,
  param,
} from "@/components/question-bank/pro/ProChrome";
import { ProQuestionCard } from "@/components/question-bank/pro/ProQuestionCard";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: { semester: string } }) {
  return { title: `Previous Years’ Questions — Semester ${params.semester} — ${PRO_NAME}` };
}

const PAGE_SIZE = 25;

interface Subject {
  subject_code: string;
  subject_name: string;
  question_count: number;
}
interface Row {
  id: number;
  question_type: string | null;
  marks: string | null;
  question: string;
  answer: string | null;
  answer_formatted: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_option: string | null;
  rationale: string | null;
  exam_tip: string | null;
  times_asked: number;
  years_asked: string[] | null;
  sittings: string[] | null;
  total_count: number;
}

/**
 * Previous Years’ Solved Questions (nerusalem.in previous-questions.html):
 * choose a subject, then its questions — most asked first — 25 a page.
 */
export default async function ProPreviousPage({
  params,
  searchParams,
}: {
  params: { semester: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const semester = parseSemester(params.semester);
  if (!semester) notFound();
  const ctx = await requireProBank();
  const sample = requireSemesterMode(ctx, semester) === "sample";
  // One card per subject NAME, as on the source page: a few questions sit
  // under a stray code (SEM1_ANP) that shares its name with a real subject, and
  // the source queried all of a name's codes together.
  const rows0 = (await gatedRead<Subject[]>(ctx, "get_previous_question_subjects", { p_semester: semester })) ?? [];
  const subjects: { key: string; name: string; codes: string[]; count: number }[] = [];
  for (const r of rows0) {
    const g = subjects.find((x) => x.name === r.subject_name);
    if (g) {
      g.codes.push(r.subject_code);
      g.count += Number(r.question_count);
    } else subjects.push({ key: r.subject_code, name: r.subject_name, codes: [r.subject_code], count: Number(r.question_count) });
  }
  const progress = await getProgress(ctx, semester);
  const doneOf = (codes: string[]) =>
    (progress?.previous_subjects ?? []).filter((p) => codes.includes(p.code)).reduce((n, p) => n + Number(p.done), 0);
  const wanted = param(searchParams, "subject");
  const chosen = subjects.find((s) => s.codes.includes(wanted ?? ""));
  const base = `${PRO_HOME}/${semester}/previous`;

  if (!chosen) {
    return (
      <div className="space-y-6">
        <ProBack href={`${PRO_HOME}/${semester}`} label={`Semester ${semester}`} />
        <ProHeader
          eyebrow={`Semester ${semester}`}
          title="Previous Years’ Solved Questions"
          subtitle="Study previous years’ university questions with clear solved answers, previous exam frequency, years asked and available Nerusalem exam tips."
        />
        <section className="flex items-end justify-between gap-3">
          <h2 className="text-xl font-semibold">Choose a Subject</h2>
          <span className="text-[13px] font-semibold text-muted-foreground">
            {subjects.length} {subjects.length === 1 ? "subject" : "subjects"}
          </span>
        </section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => (
            <Link
              key={s.key}
              href={`${base}?subject=${encodeURIComponent(s.key)}`}
              className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover"
            >
              <h3 className="text-[17px] font-bold leading-snug group-hover:text-primary">{s.name}</h3>
              <p className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted-foreground">
                <History className="h-4 w-4 text-primary" />
                {s.count.toLocaleString("en-IN")} previous years’ solved questions
              </p>
              {progress && (
                <div className="mt-3">
                  <ProgressBar done={doneOf(s.codes)} total={s.count} size="sm" />
                </div>
              )}
              <span className="mt-4 inline-flex items-center gap-1 border-t border-border pt-3 text-[14px] font-bold text-primary">
                Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
        <ProFooter />
      </div>
    );
  }

  const q = sample ? undefined : param(searchParams, "q");
  const page = sample ? 1 : pageParam(searchParams);
  const yearOptions = await getYearOptions(semester, "previous");
  const years = sample ? [] : parseYears(param(searchParams, "years"), yearOptions.years.map((y) => y.year));
  const repeatParam = param(searchParams, "repeat");
  const pattern = !sample && REPEAT_PATTERNS.some((p) => p.value === repeatParam) ? (repeatParam as RepeatPattern) : undefined;
  const rows =
    (await gatedRead<Row[]>(ctx, "get_previous_questions_page", {
      p_semester: semester,
      p_subject_codes: chosen.codes,
      p_search: q ?? "",
      p_offset: (page - 1) * PAGE_SIZE,
      p_limit: PAGE_SIZE,
      p_years: years.length ? years : null,
      p_pattern: pattern ?? null,
    })) ?? [];
  const total = rows.length ? Number(rows[0].total_count) : 0;
  const href = linkBuilder(base, { subject: chosen.key, q, years: years.length ? years.join(",") : undefined, repeat: pattern });
  const [marksById] = await Promise.all([
    getMarks(ctx, "q", rows.map((r) => r.id)),
    recordResume(ctx, semester, href({ page }), `Semester ${semester} · Previous Years · ${chosen.name}${page > 1 ? ` · page ${page}` : ""}`),
  ]);

  return (
    <div className="space-y-5">
      <ProBack href={base} label="Subjects" />
      <ProHeader eyebrow={`Semester ${semester} · Previous Years`} title={chosen.name} subtitle="Most frequently asked questions first, with the years they were asked." />

      {sample ? (
        <ProSampleNotice semester={semester} shown={rows.length} total={chosen.count} noun="questions in this subject" buyUrl={ctx.access.buyUrl} />
      ) : (
        <div className="flex flex-col gap-2">
          <ProSearch action={base} keep={{ subject: chosen.key, years: years.length ? years.join(",") : undefined, repeat: pattern }} value={q} placeholder="Search questions" />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <YearFilters options={yearOptions} years={years} pattern={pattern} href={href} />
            {(years.length > 0 || pattern) && (
              <a href={href({ years: undefined, repeat: undefined })} className="text-[13px] font-semibold text-primary hover:underline">
                Clear year filters
              </a>
            )}
          </div>
        </div>
      )}

      {!sample && progress && <ProgressBar done={doneOf(chosen.codes)} total={chosen.count} label={`Your progress · ${chosen.name}`} />}

      {!sample && <ProCountBar from={total ? (page - 1) * PAGE_SIZE + 1 : 0} to={(page - 1) * PAGE_SIZE + rows.length} total={total} noun="questions" />}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="mt-3 text-[16px] font-medium text-slate-700 dark:text-slate-300">No questions match. Try another search or year filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((x, i) => (
            <ProQuestionCard
              key={x.id}
              q={{
                id: x.id,
                number: (page - 1) * PAGE_SIZE + i + 1,
                question: x.question,
                type: x.question_type,
                marks: x.marks,
                options: questionOptions(x),
                correctOption: x.correct_option,
                answerHtml: formatAnswer(x.answer_formatted || x.answer),
                rationaleHtml: formatAnswer(x.rationale),
                tipHtml: formatAnswer(x.exam_tip),
                timesAsked: Number(x.times_asked) || null,
                sittings: x.sittings ?? [],
                mark: marksById[String(x.id)] ?? { saved: false, done: false },
              }}
            />
          ))}
        </div>
      )}

      {!sample && <ProPager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(n) => href({ page: n })} />}
      <ProFooter />
    </div>
  );
}

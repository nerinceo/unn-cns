import { notFound } from "next/navigation";
import { SearchX, SlidersHorizontal } from "lucide-react";
import { FilterSelect } from "@/components/question-bank/FilterSelect";
import {
  PRO_HOME,
  gatedRead,
  getMarks,
  getProgress,
  parseSemester,
  questionOptions,
  recordResume,
  requireProBank,
  requireSemesterMode,
  type ProQuestionRow,
} from "@/lib/cns/qbank-pro";
import { ProgressBar } from "@/components/question-bank/pro/Progress";
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
  return { title: `Model Questions — Semester ${params.semester} — ${PRO_NAME}` };
}

const PAGE_SIZE = 30;

interface Options {
  subjects: { code: string; name: string }[];
  units: { code: string; name: string }[];
  types: string[];
  marks: number[];
  has_drawing: boolean;
}
interface Row {
  question: ProQuestionRow;
  total_count: number;
}

/**
 * Model Questions & Answers (nerusalem.in model-questions.html): a subject,
 * then unit / type / marks / search, 30 questions a page.
 */
export default async function ProModelPage({
  params,
  searchParams,
}: {
  params: { semester: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const semester = parseSemester(params.semester);
  if (!semester) notFound();
  const ctx = await requireProBank();
  const mode = requireSemesterMode(ctx, semester);
  const sample = mode === "sample";

  const all = await gatedRead<Options>(ctx, "model_question_filter_options_v1", { p_semester: semester, p_subject: null });
  const subjects = all?.subjects ?? [];
  const subject = subjects.find((s) => s.code === param(searchParams, "subject"))?.code ?? subjects[0]?.code;

  const opts = subject ? await gatedRead<Options>(ctx, "model_question_filter_options_v1", { p_semester: semester, p_subject: subject }) : null;
  const unit = sample ? undefined : opts?.units.find((u) => u.code === param(searchParams, "unit"))?.code;
  const typeParam = sample ? undefined : param(searchParams, "type");
  const drawing = typeParam === "drawing";
  const type = !drawing && typeParam && opts?.types.includes(typeParam) ? typeParam : undefined;
  const marksParam = Number(param(searchParams, "marks"));
  const marks = !sample && opts?.marks.includes(marksParam) ? marksParam : undefined;
  const q = sample ? undefined : param(searchParams, "q");
  const page = sample ? 1 : pageParam(searchParams);

  const rows = subject
    ? ((await gatedRead<Row[]>(ctx, "model_questions_page_v1", {
        p_semester: semester,
        p_subject: subject,
        p_unit: unit ?? null,
        p_type: type ?? null,
        p_marks: marks ?? null,
        p_drawing: drawing,
        p_search: q ?? null,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      })) ?? [])
    : [];
  const total = rows.length ? Number(rows[0].total_count) : 0;
  const pages = Math.ceil(total / PAGE_SIZE);
  const base = `${PRO_HOME}/${semester}/model`;
  const current = { subject, unit, type: drawing ? "drawing" : type, marks: marks ? String(marks) : undefined, q };
  const href = linkBuilder(base, current);
  const subjectName = subjects.find((s) => s.code === subject)?.name ?? "";
  const [marksById, progress] = await Promise.all([
    getMarks(ctx, "q", rows.map((r) => r.question.id)),
    getProgress(ctx, semester),
    recordResume(ctx, semester, href({ page }), `Semester ${semester} · Model Questions · ${subjectName}${page > 1 ? ` · page ${page}` : ""}`),
  ]);
  const subjectProgress = progress?.model_subjects.find((p) => p.code === subject);

  return (
    <div className="space-y-5">
      <ProBack href={`${PRO_HOME}/${semester}`} label={`Semester ${semester}`} />
      <ProHeader
        eyebrow={`Semester ${semester}`}
        title="Model Questions & Answers"
        subtitle={`Select a subject and unit, then use the filters to find questions. Questions show ${PAGE_SIZE} to a page.`}
      />

      {sample && <ProSampleNotice semester={semester} shown={rows.length} total={total} noun="questions in this subject" buyUrl={ctx.access.buyUrl} />}

      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 rounded-t-xl border-b border-border bg-primary/[0.06] px-5 py-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-[14px] font-bold uppercase tracking-wide text-primary">Filter questions</h2>
        </div>
        <div className="flex flex-col gap-2 p-5 pt-3">
          {!sample && <ProSearch action={base} keep={{ ...current, q: undefined }} value={q} placeholder="Search questions and answers" />}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <FilterSelect
              variant="subject"
              allLabel="Select subject"
              allHref={href({ subject: subjects[0]?.code, unit: undefined, type: undefined, marks: undefined, q: undefined })}
              widthClass="w-[22rem]"
              options={subjects.map((s) => ({
                label: s.name,
                href: href({ subject: s.code, unit: undefined, type: undefined, marks: undefined, q: undefined }),
                active: s.code === subject,
              }))}
            />
            {!sample && opts && opts.units.length > 1 && (
              <FilterSelect
                variant="unit"
                allLabel="All units"
                allHref={href({ unit: undefined })}
                widthClass="w-[24rem]"
                options={opts.units.map((u) => ({ label: u.name, href: href({ unit: u.code }), active: u.code === unit }))}
              />
            )}
            {!sample && opts && (opts.types.length > 1 || opts.has_drawing) && (
              <FilterSelect
                variant="type"
                allLabel="All question types"
                allHref={href({ type: undefined })}
                options={[
                  ...(opts.has_drawing ? [{ label: "Drawing questions", href: href({ type: "drawing" }), active: drawing }] : []),
                  ...opts.types.map((t) => ({ label: t, href: href({ type: t }), active: t === type })),
                ]}
              />
            )}
            {!sample && opts && opts.marks.length > 1 && (
              <FilterSelect
                variant="marks"
                allLabel="All marks"
                allHref={href({ marks: undefined })}
                widthClass="w-56"
                options={opts.marks.map((m) => ({ label: `${m} ${m === 1 ? "mark" : "marks"}`, href: href({ marks: m }), active: m === marks }))}
              />
            )}
          </div>
        </div>
      </section>

      {subjectProgress && <ProgressBar done={subjectProgress.done} total={subjectProgress.total} label={`Your progress · ${subjectName}`} />}

      {!sample && <ProCountBar from={total ? (page - 1) * PAGE_SIZE + 1 : 0} to={(page - 1) * PAGE_SIZE + rows.length} total={total} noun="questions" />}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="mt-3 text-[16px] font-medium text-slate-700 dark:text-slate-300">No questions match these filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((r, i) => {
            const x = r.question;
            return (
              <ProQuestionCard
                key={x.id}
                q={{
                  id: x.id,
                  number: (page - 1) * PAGE_SIZE + i + 1,
                  question: x.question,
                  type: x.question_type,
                  marks: x.marks,
                  unit: x.official_unit_name,
                  drawing: x.diagram_needed === true,
                  options: questionOptions(x),
                  correctOption: x.correct_option,
                  answerHtml: formatAnswer(x.answer_formatted || x.answer),
                  rationaleHtml: formatAnswer(x.rationale),
                  tipHtml: formatAnswer(x.exam_tip),
                  mark: marksById[String(x.id)] ?? { saved: false, done: false },
                }}
              />
            );
          })}
        </div>
      )}

      {!sample && <ProPager page={page} pages={pages} href={(n) => href({ page: n })} />}
      <ProFooter />
    </div>
  );
}

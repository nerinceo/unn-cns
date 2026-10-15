import { notFound } from "next/navigation";
import { SearchX, SlidersHorizontal } from "lucide-react";
import { FilterSelect } from "@/components/question-bank/FilterSelect";
import { PRO_HOME, gatedRead, parseSemester, questionOptions, requireProBank, requireSemesterMode, type ProQuestionRow } from "@/lib/cns/qbank-pro";
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
  return { title: `Most Important Questions — Semester ${params.semester} — ${PRO_NAME}` };
}

const PAGE_SIZE = 30;
/** The source's own scale: its three importance levels, and where a question came from. */
const PRIORITIES = [
  { value: "VERY_HIGH", label: "High Priority" },
  { value: "HIGH", label: "Moderate Priority" },
  { value: "IMPORTANT", label: "Low Priority" },
] as const;
const SOURCES = [
  { value: "PYQ", label: "Previous Year Question" },
  { value: "MODEL", label: "Model Question" },
] as const;

interface Options {
  subjects: { code: string; name: string }[];
  types: string[];
  marks: number[];
}
interface Row {
  question: ProQuestionRow;
  total_count: number;
}

/**
 * Most Important Questions & Answers (nerusalem.in most-important.html):
 * the semester's ranked questions, filtered by subject, type, marks, priority
 * and source, 30 a page.
 */
export default async function ProImportantPage({
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
  const opts = await gatedRead<Options>(ctx, "miq_filter_options", { p_semester: semester });

  const pick = <T extends string>(k: string, allowed: readonly T[]) => {
    const v = param(searchParams, k);
    return !sample && v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
  };
  const subject = pick("subject", opts?.subjects.map((s) => s.code) ?? []);
  const typeParam = sample ? undefined : param(searchParams, "type");
  const drawing = typeParam === "drawing";
  const type = !drawing ? pick("type", opts?.types ?? []) : undefined;
  const marksParam = Number(param(searchParams, "marks"));
  const marks = !sample && opts?.marks.includes(marksParam) ? marksParam : undefined;
  const priority = pick("priority", PRIORITIES.map((p) => p.value));
  const source = pick("source", SOURCES.map((s) => s.value));
  const q = sample ? undefined : param(searchParams, "q");
  const page = sample ? 1 : pageParam(searchParams);

  const rows =
    (await gatedRead<Row[]>(ctx, "miq_search", {
      p_semester: semester,
      p_subject: subject ?? null,
      p_type: type ?? null,
      p_marks: marks ?? null,
      p_drawing: drawing,
      p_search: q ?? null,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
      p_priority: priority ?? null,
      p_source: source ?? null,
    })) ?? [];
  const total = rows.length ? Number(rows[0].total_count) : 0;
  const base = `${PRO_HOME}/${semester}/important`;
  const current = { subject, type: drawing ? "drawing" : type, marks: marks ? String(marks) : undefined, priority, source, q };
  const href = linkBuilder(base, current);
  const filtered = Object.values(current).some(Boolean);

  return (
    <div className="space-y-5">
      <ProBack href={`${PRO_HOME}/${semester}`} label={`Semester ${semester}`} />
      <ProHeader
        eyebrow={`Semester ${semester}`}
        title="Most Important Questions & Answers"
        subtitle="Focused exam preparation with ranked questions, clear answers, priority levels, and question sources."
      />

      {sample ? (
        <ProSampleNotice semester={semester} shown={rows.length} total={total} noun="ranked questions" buyUrl={ctx.access.buyUrl} />
      ) : (
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 rounded-t-xl border-b border-border bg-primary/[0.06] px-5 py-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-[14px] font-bold uppercase tracking-wide text-primary">Filter questions</h2>
            {filtered && (
              <a href={base} className="ml-auto text-[13px] font-semibold text-primary hover:underline">
                Clear filters
              </a>
            )}
          </div>
          <div className="flex flex-col gap-2 p-5 pt-3">
            <ProSearch action={base} keep={{ ...current, q: undefined }} value={q} placeholder="Search all questions" />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <FilterSelect
                variant="subject"
                allLabel="All subjects"
                allHref={href({ subject: undefined })}
                widthClass="w-[22rem]"
                options={(opts?.subjects ?? []).map((s) => ({ label: s.name, href: href({ subject: s.code }), active: s.code === subject }))}
              />
              <FilterSelect
                variant="type"
                allLabel="All question types"
                allHref={href({ type: undefined })}
                options={[
                  { label: "Drawing questions", href: href({ type: "drawing" }), active: drawing },
                  ...(opts?.types ?? []).map((t) => ({ label: t, href: href({ type: t }), active: t === type })),
                ]}
              />
              <FilterSelect
                variant="marks"
                allLabel="All marks"
                allHref={href({ marks: undefined })}
                widthClass="w-56"
                options={(opts?.marks ?? []).map((m) => ({ label: `${m} ${m === 1 ? "mark" : "marks"}`, href: href({ marks: m }), active: m === marks }))}
              />
              <FilterSelect
                variant="priority"
                allLabel="All priorities"
                allHref={href({ priority: undefined })}
                widthClass="w-60"
                options={PRIORITIES.map((p) => ({ label: p.label, href: href({ priority: p.value }), active: p.value === priority }))}
              />
              <FilterSelect
                variant="source"
                allLabel="All sources"
                allHref={href({ source: undefined })}
                widthClass="w-64"
                options={SOURCES.map((s) => ({ label: s.label, href: href({ source: s.value }), active: s.value === source }))}
              />
            </div>
          </div>
        </section>
      )}

      {!sample && <ProCountBar from={total ? (page - 1) * PAGE_SIZE + 1 : 0} to={(page - 1) * PAGE_SIZE + rows.length} total={total} noun="questions" />}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="mt-3 text-[16px] font-medium text-slate-700 dark:text-slate-300">No questions match the selected filters in Semester {semester}.</p>
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
                  subject: x.official_subject_name,
                  drawing: x.diagram_needed === true,
                  options: questionOptions(x),
                  correctOption: x.correct_option,
                  answerHtml: formatAnswer(x.answer_formatted || x.answer),
                  rationaleHtml: formatAnswer(x.rationale),
                  tipHtml: formatAnswer(x.exam_tip),
                  priority: PRIORITIES.find((p) => p.value === x.importance_level)?.label ?? null,
                  source: SOURCES.find((s) => s.value === x.source_group)?.label ?? null,
                }}
              />
            );
          })}
        </div>
      )}

      {!sample && <ProPager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(n) => href({ page: n })} />}
      <ProFooter />
    </div>
  );
}

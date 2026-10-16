import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, History, SearchX } from "lucide-react";
import {
  PRO_HOME,
  REPEAT_PATTERNS,
  SCHEMES,
  filterYears,
  gatedRead,
  getMarks,
  getReadState,
  getYearFacets,
  parseSemester,
  parseYears,
  diagramSrc,
  questionOptions,
  recordResume,
  requireProBank,
  requireSemesterMode,
  sittingsIn,
  yearsParam,
  type RepeatPattern,
  type Scheme,
} from "@/lib/cns/qbank-pro";
import { YearFilters } from "@/components/question-bank/pro/YearFilters";
import { ReadProgress } from "@/components/question-bank/pro/Progress";
import { FilterSelect } from "@/components/question-bank/FilterSelect";
import { proHtml } from "@/lib/cns/qbank-pro-format";
import {
  PRO_NAME,
  ProBack,
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
  answer_html?: string | null;
  rationale_html?: string | null;
  tip_html?: string | null;
  diagram_image_url?: string | null;
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
                Previous years’ solved questions
              </p>
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
  const repeatParam = param(searchParams, "repeat");
  const pattern = !sample && REPEAT_PATTERNS.some((p) => p.value === repeatParam) ? (repeatParam as RepeatPattern) : undefined;
  const schemeParam = param(searchParams, "scheme");
  const scheme = !sample && SCHEMES.some((x) => x.value === schemeParam) ? (schemeParam as Scheme) : undefined;
  const rawYears = sample ? [] : yearsParam(param(searchParams, "years"));
  // Read / unread: members who have this semester (not samples).
  const readParam = param(searchParams, "read");
  const readFilter = !sample && ctx.userId && (readParam === "read" || readParam === "unread") ? readParam : undefined;
  const [yearOptions, readState] = await Promise.all([
    getYearFacets(semester, "previous", { codes: chosen.codes, scheme, years: rawYears }),
    sample ? Promise.resolve(null) : getReadState(ctx, semester, chosen.codes),
  ]);
  const offered = yearOptions.years.map((y) => y.year);
  const years = parseYears(rawYears.join(","), offered);
  const queryYears = filterYears(years, scheme, offered);
  const rows =
    (await gatedRead<Row[]>(ctx, "get_previous_questions_page", {
      p_semester: semester,
      p_subject_codes: chosen.codes,
      p_search: q ?? "",
      p_offset: (page - 1) * PAGE_SIZE,
      p_limit: PAGE_SIZE,
      p_years: queryYears,
      p_pattern: pattern ?? null,
      ...(readFilter ? { p_user: ctx.userId, p_read: readFilter } : {}),
    })) ?? [];
  const total = rows.length ? Number(rows[0].total_count) : 0;
  // Read / Unread counts follow the other filters (search, scheme, years,
  // repeat), so each chip equals what choosing it lists. The bar stays the
  // whole subject's progress.
  const filtered = !!q || (queryYears?.length ?? 0) > 0 || !!pattern;
  const countOf = async (read: "read" | "unread") => {
    const r = await gatedRead<Row[]>(ctx, "get_previous_questions_page", {
      p_semester: semester,
      p_subject_codes: chosen.codes,
      p_search: q ?? "",
      p_offset: 0,
      p_limit: 1,
      p_years: queryYears,
      p_pattern: pattern ?? null,
      p_user: ctx.userId,
      p_read: read,
    });
    return r?.length ? Number(r[0].total_count) : 0;
  };
  const readCounts = readState
    ? filtered
      ? await Promise.all([countOf("unread"), countOf("read")]).then(([unread, read]) => ({ unread, read }))
      : { unread: Math.max(0, readState.total - readState.read), read: readState.read }
    : null;
  const href = linkBuilder(base, { subject: chosen.key, q, years: years.length ? years.join(",") : undefined, repeat: pattern, scheme, read: readFilter });
  const [marksById] = await Promise.all([
    getMarks(ctx, "q", rows.map((r) => r.id)),
    recordResume(ctx, semester, href({ page }), `Semester ${semester} · Previous Years · ${chosen.name}${page > 1 ? ` · page ${page}` : ""}`),
  ]);

  return (
    <div className="space-y-5">
      <ProBack href={base} label="Subjects" />
      <ProHeader eyebrow={`Semester ${semester} · Previous Years`} title={chosen.name} subtitle="Most frequently asked questions first, with the years they were asked." />

      {sample ? (
        <ProSampleNotice semester={semester} shown={rows.length} noun="questions in this subject" buyUrl={ctx.access.buyUrl} />
      ) : (
        <div className="flex flex-col gap-2">
          <ProSearch action={base} keep={{ subject: chosen.key, years: years.length ? years.join(",") : undefined, repeat: pattern, scheme, read: readFilter }} value={q} placeholder="Search questions" />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <YearFilters options={yearOptions} years={years} pattern={pattern} scheme={scheme} href={href} />
            {readState && (
              <FilterSelect
                variant="read"
                emphasizeCounts
                allLabel="Read & unread"
                allHref={href({ read: undefined })}
                widthClass="w-60"
                options={[
                  { label: "Unread", count: readCounts?.unread ?? 0, href: href({ read: "unread" }), active: readFilter === "unread" },
                  { label: "Read", count: readCounts?.read ?? 0, href: href({ read: "read" }), active: readFilter === "read" },
                ]}
              />
            )}
            {(years.length > 0 || pattern || scheme) && (
              <a href={href({ years: undefined, repeat: undefined, scheme: undefined })} className="text-[13px] font-semibold text-primary hover:underline">
                Clear year filters
              </a>
            )}
          </div>
        </div>
      )}


      {readState && <ReadProgress read={readState.read} total={readState.total} />}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="mt-3 text-[16px] font-medium text-slate-700 dark:text-slate-300">
            {readFilter === "unread" && !q && !years.length && !pattern && !scheme
              ? "You have read every question in this subject."
              : "No questions match. Try another search or filter."}
          </p>
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
                answerHtml: proHtml(x.answer_html, x.answer_formatted || x.answer),
                rationaleHtml: proHtml(x.rationale_html, x.rationale),
                tipHtml: proHtml(x.tip_html, x.exam_tip),
                diagramUrl: diagramSrc(x.diagram_image_url),
                // Filtering by scheme or years shows only those sittings, and counts them.
                ...(() => {
                  const shown = sittingsIn(x.sittings ?? [], years.length || scheme ? queryYears : null);
                  return { timesAsked: (years.length || scheme ? shown.length : Number(x.times_asked)) || null, sittings: shown };
                })(),
                mark: sample
                  ? undefined
                  : { saved: marksById[String(x.id)]?.saved ?? false, read: ctx.userId ? (marksById[String(x.id)]?.done ?? false) : undefined },
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

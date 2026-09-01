import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  BookOpenCheck,
  CheckCircle2,
  Info,
  Lightbulb,
  Shapes,
  Target,
  type LucideIcon,
} from "lucide-react";
import { getInstitutionBySlug } from "@/lib/cns/question-bank";
import { getBankQuestion, getTopicIndex } from "@/lib/cns/nursing-bank";
import { getStudySubject } from "@/lib/cns/study";
import { questionTone } from "@/components/question-bank/question-tone";
import {
  ANSWER_LABELS_HEADING,
  dedupeModelAnswer,
  COURSES,
  DISCLAIMER,
  QUESTION_DETAIL_COPY,
  SEMESTERS,
  bankFooter,
  marksLabel,
  metaChain,
} from "@/lib/cns/question-bank-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question — Central Nursing Systems" };

/**
 * The full-page view of one question — the legacy question.html.
 *
 * Shares the list's visual language (type rail, family colour, answer panels)
 * so a question looks like itself in both places, but keeps the detail page's
 * own wording: labels here are the heading form, "Answer" without the colon
 * the list uses. Both come from lib/cns/question-bank-content.ts so neither
 * can drift from the source.
 */
export default async function BankQuestionPage({
  params,
}: {
  params: Promise<{ institution: string; course: string; semester: string; questionId: string }>;
}) {
  const { institution: slug, course: courseKey, semester: semesterParam, questionId } = await params;

  const course = COURSES.find((c) => c.key === courseKey);
  const semesterNumber = Number(semesterParam);
  const semester = SEMESTERS.find((s) => s.number === semesterNumber);
  if (!course || !course.available || !semester) notFound();

  const institution = await getInstitutionBySlug(slug);
  if (!institution) notFound();

  const q = await getBankQuestion(questionId);
  if (!q) notFound();

  const subject = await getStudySubject(q.subject_id);
  // A question reached under the wrong university or semester would otherwise
  // render fine under a breadcrumb it does not belong to.
  if (!subject || subject.institution_id !== institution.id) notFound();
  if (subject.semester !== semesterNumber) notFound();

  const topicIdx = await getTopicIndex([q.subject_id]);
  const t = q.topic_id ? topicIdx.get(q.topic_id) : undefined;

  const tone = questionTone(q.source_question_type);
  const TypeIcon = tone.icon;

  const meta = metaChain([
    institution.short_name ?? institution.name,
    course.name,
    `Semester ${semesterNumber}`,
    subject.name as string,
    t?.unitName,
    t?.name,
  ]);

  const options = ([["A", q.option_a], ["B", q.option_b], ["C", q.option_c], ["D", q.option_d]] as const)
    .filter(([, v]) => v) as [string, string][];

  const back = `/question-bank/${slug}/${courseKey}/${semesterNumber}`;

  return (
    <div className="space-y-5">
      <Link
        href={back}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        {QUESTION_DETAIL_COPY.back}
      </Link>

      <header className="rounded-2xl border border-border bg-gradient-to-br from-primary/[0.07] via-card to-card p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {QUESTION_DETAIL_COPY.heading}
        </h1>
        <p className="mt-2 text-[15px] font-medium text-slate-600 dark:text-slate-400">
          {metaChain([subject.name as string, t?.unitName])}
        </p>
      </header>

      <article className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${tone.rail}`} />

        <div className="p-6 pl-7">
          <div className="flex flex-wrap items-center gap-2">
            {q.source_question_type && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset ${tone.badge}`}
              >
                <TypeIcon className="h-3.5 w-3.5" />
                {q.source_question_type}
              </span>
            )}
            {q.marks != null && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                <Award className="h-3.5 w-3.5" />
                {marksLabel(q.marks)}
              </span>
            )}
          </div>

          <p className="mt-3 text-[12.5px] font-medium leading-snug text-slate-600 dark:text-slate-400">
            {meta}
          </p>

          <p className="mt-2 max-w-[78ch] whitespace-pre-wrap text-[17px] font-semibold leading-[1.6] tracking-[-0.005em] text-foreground">
            {q.stem}
          </p>

          {options.length > 0 && (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {options.map(([letter, text]) => (
                <li
                  key={letter}
                  className="rounded-lg border border-border/70 bg-background/60 px-3 py-2.5 text-[14px] leading-relaxed text-slate-800 dark:text-slate-200"
                >
                  <span className="font-bold text-primary dark:text-blue-300">{letter}.</span> {text}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4 border-t border-border bg-background/70 px-6 py-5 pl-7">
          {q.correct_option && (
            <div className="border-l-[3px] border-primary/30 pl-3.5">
              <p className="flex items-center gap-1.5 text-[14.5px] font-bold text-primary dark:text-blue-300">
                <CheckCircle2 className="h-[18px] w-[18px] shrink-0" />
                {ANSWER_LABELS_HEADING.correctOption}
              </p>
              <p className="mt-1.5">
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-emerald-50 px-2.5 text-[15px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25">
                  {q.correct_option}
                </span>
              </p>
            </div>
          )}
          {dedupeModelAnswer(q.model_answer, q.rationale) && (
            <Panel
              icon={BookOpenCheck}
              heading={ANSWER_LABELS_HEADING.answer}
              body={dedupeModelAnswer(q.model_answer, q.rationale) as string}
            />
          )}
          {q.rationale && (
            <Panel icon={Lightbulb} heading={ANSWER_LABELS_HEADING.rationale} body={q.rationale} />
          )}
          {q.exam_tip && (
            <Panel icon={Target} heading={ANSWER_LABELS_HEADING.examTip} body={q.exam_tip} />
          )}
          {q.diagram_note && <Panel icon={Shapes} heading="Diagram" body={q.diagram_note} />}
        </div>
      </article>

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

function Panel({
  icon: Icon,
  heading,
  body,
}: {
  icon: LucideIcon;
  heading: string;
  body: string;
}) {
  return (
    <div className="border-l-[3px] border-primary/30 pl-3.5">
      <p className="flex items-center gap-1.5 text-[14.5px] font-bold text-primary dark:text-blue-300">
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {heading}
      </p>
      <p className="mt-1.5 max-w-[78ch] whitespace-pre-wrap text-[15px] font-medium leading-[1.7] text-slate-800 dark:text-slate-200">
        {body}
      </p>
    </div>
  );
}

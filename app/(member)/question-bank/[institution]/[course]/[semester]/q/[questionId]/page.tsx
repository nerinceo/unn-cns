import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getInstitutionBySlug } from "@/lib/cns/question-bank";
import { getBankQuestion, getTopicIndex } from "@/lib/cns/nursing-bank";
import { getStudySubject } from "@/lib/cns/study";
import {
  ANSWER_LABELS_HEADING,
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
 * Labels here are the heading form ("Answer"), not the inline form ("Answer:")
 * used on the list. The source carried both and this mirrors it; both come from
 * lib/cns/question-bank-content.ts so neither can drift.
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

  const meta = metaChain([
    institution.short_name ?? institution.name,
    course.name,
    `Semester ${semesterNumber}`,
    subject.name as string,
    t?.unitName,
    t?.name,
    q.source_question_type,
    q.marks != null ? marksLabel(q.marks) : null,
  ]);

  const options = [
    ["A", q.option_a],
    ["B", q.option_b],
    ["C", q.option_c],
    ["D", q.option_d],
  ].filter(([, v]) => v) as [string, string][];

  const back = `/question-bank/${slug}/${courseKey}/${semesterNumber}`;

  return (
    <div className="space-y-6">
      <Link
        href={back}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        {QUESTION_DETAIL_COPY.back}
      </Link>

      <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold sm:text-3xl">{QUESTION_DETAIL_COPY.heading}</h1>
        <p className="mt-2 text-muted-foreground">
          {metaChain([subject.name as string, t?.unitName])}
        </p>
      </header>

      <article className="rounded-xl border border-border bg-card p-6">
        <p className="text-xs text-muted-foreground">{meta}</p>

        <p className="mt-3 whitespace-pre-wrap text-lg font-medium leading-relaxed">{q.stem}</p>

        {options.length > 0 && (
          <ul className="mt-4 space-y-2">
            {options.map(([letter, text]) => (
              <li key={letter} className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                {letter}. {text}
              </li>
            ))}
          </ul>
        )}

        {q.correct_option && (
          <Panel heading={ANSWER_LABELS_HEADING.correctOption} body={q.correct_option} />
        )}
        {q.model_answer && <Panel heading={ANSWER_LABELS_HEADING.answer} body={q.model_answer} />}
        {q.rationale && <Panel heading={ANSWER_LABELS_HEADING.rationale} body={q.rationale} />}
        {q.exam_tip && <Panel heading={ANSWER_LABELS_HEADING.examTip} body={q.exam_tip} />}
        {q.diagram_note && <Panel heading="Diagram" body={q.diagram_note} />}
      </article>

      <p className="rounded-xl border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
        <strong className="font-semibold">{DISCLAIMER.label}</strong> {DISCLAIMER.body}
      </p>

      <p className="text-center text-xs text-muted-foreground">
        {bankFooter(`${institution.short_name ?? institution.name} ${course.name}`)}
      </p>
    </div>
  );
}

function Panel({ heading, body }: { heading: string; body: string }) {
  return (
    <section className="mt-4 rounded-lg bg-muted/50 p-4">
      <h3 className="font-semibold text-primary">{heading}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
    </section>
  );
}

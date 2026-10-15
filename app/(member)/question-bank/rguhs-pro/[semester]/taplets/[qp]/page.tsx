import { notFound } from "next/navigation";
import { PRO_HOME, PRO_SAMPLE, getTapletPaper, parseSemester, recordResume, requireProBank, requireSemesterMode, tapletSubject } from "@/lib/cns/qbank-pro";
import { PRO_NAME, ProBack, ProFooter, ProHeader, ProSampleNotice } from "@/components/question-bank/pro/ProChrome";
import { TapletDeck } from "@/components/question-bank/pro/TapletDeck";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: `Practice Taplets — ${PRO_NAME}` };
}

/** One paper's Taplets (nerusalem.in practice-taplets/papers/qpNNNN.html). */
export default async function ProTapletPaperPage({ params }: { params: { semester: string; qp: string } }) {
  const semester = parseSemester(params.semester);
  if (!semester || !/^\d{3,6}$/.test(params.qp)) notFound();
  const ctx = await requireProBank();
  const sample = requireSemesterMode(ctx, semester) === "sample";
  const data = await getTapletPaper(params.qp, sample ? PRO_SAMPLE.taplets : 1000);
  if (!data.paper || data.paper.semester !== semester) notFound();
  const subject = tapletSubject(data.paper.title);
  await recordResume(ctx, semester, `${PRO_HOME}/${semester}/taplets/${params.qp}`, `Semester ${semester} · Practice Taplets · ${subject}`);

  return (
    <div className="space-y-6">
      <ProBack href={`${PRO_HOME}/${semester}/taplets`} label={`Semester ${semester} subjects`} />
      <ProHeader
        eyebrow={`Nerusalem · RGUHS B.Sc Nursing · Semester ${semester}`}
        title={subject}
        subtitle={`${data.paper.tasks} interactive Practice Taplets · Mixed recall, MCQs, true/false, quick-answer cards and challenges. Answer a question to complete each card.`}
      />
      {sample && <ProSampleNotice semester={semester} shown={data.tasks.length} total={data.paper.tasks} noun="Taplets in this paper" buyUrl={ctx.access.buyUrl} />}
      <TapletDeck tasks={data.tasks} />
      <ProFooter />
    </div>
  );
}

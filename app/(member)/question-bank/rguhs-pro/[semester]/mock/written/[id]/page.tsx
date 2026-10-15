import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { PRO_HOME, gatedRead, getAttempt, parseSemester, requireProBank, requireSemesterMode } from "@/lib/cns/qbank-pro";
import type { PaperQuestion, WrittenExam } from "@/lib/cns/qbank-pro-exams";
import { PRO_NAME, ProBack } from "@/components/question-bank/pro/ProChrome";
import { WrittenExamRunner } from "@/components/question-bank/pro/ExamRunner";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: `Written Exam — ${PRO_NAME}` };
}

export default async function ProWrittenExamPage({ params }: { params: { semester: string; id: string } }) {
  const semester = parseSemester(params.semester);
  const id = Number(params.id);
  if (!semester || !Number.isSafeInteger(id) || id <= 0) notFound();
  const ctx = await requireProBank();
  requireSemesterMode(ctx, semester);

  const catalog = (await gatedRead<WrittenExam[]>(ctx, "get_written_exam_catalog", {})) ?? [];
  const exam = catalog.find((e) => e.mock_exam_id === id && e.semester === semester);
  if (!exam) notFound();
  const back = `${PRO_HOME}/${semester}/mock`;

  const paper = await gatedRead<PaperQuestion[]>(ctx, "get_written_exam_paper", { p_mock_exam_id: id });
  if (!paper) {
    return (
      <div className="space-y-5">
        <ProBack href={back} label="Mock Exams" />
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Lock className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-[17px] font-bold">{exam.title}</p>
          <p className="mt-1 text-[15px] text-muted-foreground">This mock exam is in the full Semester {semester} bank. The first one is free to try.</p>
          {ctx.access.buyUrl && (
            <a href={ctx.access.buyUrl} className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Buy Semester {semester} or the whole bank
            </a>
          )}
        </div>
      </div>
    );
  }

  const attempt = ctx.userId ? await getAttempt(ctx.userId, "written", id) : null;
  return (
    <WrittenExamRunner
      examId={id}
      title={exam.title}
      semester={semester}
      mockNumber={exam.mock_number}
      totalMarks={exam.total_marks}
      minutes={exam.duration_minutes}
      instructions={exam.instructions}
      questions={paper}
      backHref={back}
      submitted={!!attempt}
      savedScore={attempt?.self_score != null ? Number(attempt.self_score) : null}
    />
  );
}

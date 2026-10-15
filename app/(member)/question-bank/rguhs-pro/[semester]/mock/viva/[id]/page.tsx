import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { PRO_HOME, gatedRead, getAttempt, parseSemester, recordResume, requireProBank, requireSemesterMode } from "@/lib/cns/qbank-pro";
import { type VivaExam, type VivaQuestion, vivaGroupName } from "@/lib/cns/qbank-pro-exams";
import { PRO_NAME, ProBack } from "@/components/question-bank/pro/ProChrome";
import { VivaExamRunner } from "@/components/question-bank/pro/ExamRunner";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: `Viva Exam — ${PRO_NAME}` };
}

export default async function ProVivaExamPage({ params }: { params: { semester: string; id: string } }) {
  const semester = parseSemester(params.semester);
  const id = Number(params.id);
  if (!semester || !Number.isSafeInteger(id) || id <= 0) notFound();
  const ctx = await requireProBank();
  requireSemesterMode(ctx, semester);

  const catalog = (await gatedRead<VivaExam[]>(ctx, "get_viva_exam_catalog", {})) ?? [];
  const exam = catalog.find((e) => e.viva_exam_id === id && e.semester === semester);
  if (!exam) notFound();
  const back = `${PRO_HOME}/${semester}/mock?tab=viva`;
  const title = vivaGroupName(exam.viva_group_key);

  const questions = await gatedRead<VivaQuestion[]>(ctx, "get_viva_exam_questions", { p_viva_exam_id: id });
  if (!questions) {
    return (
      <div className="space-y-5">
        <ProBack href={back} label="Viva Exams" />
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Lock className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-[17px] font-bold">
            {title} — Viva {exam.viva_number}
          </p>
          <p className="mt-1 text-[15px] text-muted-foreground">This viva is in the full Semester {semester} bank. The first one is free to try.</p>
          {ctx.access.buyUrl && (
            <a href={ctx.access.buyUrl} className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Buy Semester {semester} or the whole bank
            </a>
          )}
        </div>
      </div>
    );
  }

  const [attempt] = await Promise.all([
    ctx.userId ? getAttempt(ctx.userId, "viva", id) : null,
    recordResume(ctx, semester, `${PRO_HOME}/${semester}/mock/viva/${id}`, `Semester ${semester} · ${title} — Viva ${exam.viva_number}`),
  ]);
  return (
    <VivaExamRunner
      examId={id}
      title={title}
      vivaNumber={exam.viva_number}
      minutes={exam.duration_minutes}
      questions={questions}
      backHref={back}
      submitted={!!attempt}
    />
  );
}

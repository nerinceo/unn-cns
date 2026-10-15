import { notFound } from "next/navigation";
import { PRO_HOME, PRO_SAMPLE, parseSemester, requireProBank, requireSemesterMode } from "@/lib/cns/qbank-pro";
import { PRO_NAME, ProBack } from "@/components/question-bank/pro/ProChrome";
import { SosDeckView } from "@/components/question-bank/pro/SosDeckView";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: { semester: string } }) {
  return { title: `${params.semester === "8" ? "Clinical SOS" : "Exam SOS"} — Semester ${params.semester} — ${PRO_NAME}` };
}

export default async function ProSosPage({
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
  const clinical = semester === 8;
  return (
    <SosDeckView
      ctx={ctx}
      deck={`semester-${semester}`}
      base={`${PRO_HOME}/${semester}/hacks/sos`}
      back={<ProBack href={`${PRO_HOME}/${semester}/hacks`} label={clinical ? "Clinical Hacks" : "Exam Hacks"} />}
      title={clinical ? "Clinical SOS" : "Exam SOS"}
      eyebrow={`Exam Hacks · Semester ${semester}`}
      sample={sample}
      sampleSize={PRO_SAMPLE.sos}
      sampleSemester={semester}
      buyUrl={ctx.access.buyUrl}
      searchParams={searchParams}
    />
  );
}

import { PRO_HOME, PRO_SAMPLE, requireProBank } from "@/lib/cns/qbank-pro";
import { generalModeOf } from "@/lib/cns/qbank-pro-gate";
import { PRO_NAME, ProBack } from "@/components/question-bank/pro/ProChrome";
import { SosDeckView } from "@/components/question-bank/pro/SosDeckView";

export const dynamic = "force-dynamic";
export const metadata = { title: `General Exam SOS — ${PRO_NAME}` };

/** General Exam SOS (nerusalem.in exam-hacks/exam-sos/general.html): belongs to no semester — any purchase opens it. */
export default async function ProGeneralSosPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await requireProBank();
  const sample = generalModeOf(ctx.access) !== "full";
  return (
    <SosDeckView
      deck="general"
      base={`${PRO_HOME}/general-sos`}
      back={<ProBack href={PRO_HOME} label="Semesters" />}
      title="General Exam SOS"
      eyebrow="Exam Hacks · All semesters"
      sample={sample}
      sampleSize={PRO_SAMPLE.sos}
      sampleSemester={null}
      buyUrl={ctx.access.buyUrl}
      searchParams={searchParams}
    />
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Puzzle } from "lucide-react";
import { PRO_HOME, getTapletPapers, parseSemester, requireProBank, requireSemesterMode, tapletSubject } from "@/lib/cns/qbank-pro";
import { PRO_NAME, ProBack, ProFooter, ProHeader } from "@/components/question-bank/pro/ProChrome";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: { semester: string } }) {
  return { title: `Practice Taplets — Semester ${params.semester} — ${PRO_NAME}` };
}

/** Practice Taplets (nerusalem.in practice-taplets/semester-N.html): one deck per paper. */
export default async function ProTapletsPage({ params }: { params: { semester: string } }) {
  const semester = parseSemester(params.semester);
  if (!semester) notFound();
  const ctx = await requireProBank();
  requireSemesterMode(ctx, semester);
  const papers = await getTapletPapers(semester);
  const total = papers.reduce((n, p) => n + p.tasks, 0);

  return (
    <div className="space-y-6">
      <ProBack href={`${PRO_HOME}/${semester}`} label={`Semester ${semester}`} />
      <ProHeader
        eyebrow={`RGUHS · B.Sc Nursing · Semester ${semester}`}
        title="Practice Taplets"
        subtitle={`Explore Semester ${semester} practice papers through colourful Taplets, quick questions and interactive challenges.`}
        icon={<Puzzle className="h-6 w-6" />}
      >
        <div className="mt-4 flex flex-wrap gap-2 text-[13px] font-semibold">
          <span className="rounded-md bg-card px-2.5 py-1 ring-1 ring-inset ring-border">{papers.length} papers</span>
          <span className="rounded-md bg-card px-2.5 py-1 ring-1 ring-inset ring-border">{total} Taplets</span>
          <span className="rounded-md bg-card px-2.5 py-1 ring-1 ring-inset ring-border">Mixed activities</span>
        </div>
      </ProHeader>

      {papers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-[15px] text-muted-foreground">
          Semester {semester} Practice Taplets are not available yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {papers.map((p) => (
            <Link
              key={p.qp}
              href={`${PRO_HOME}/${semester}/taplets/${p.qp}`}
              className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover"
            >
              <span className="text-[12.5px] font-bold uppercase tracking-wide text-primary">Practice · QP {p.qp}</span>
              <h3 className="mt-2 text-[17px] font-bold leading-snug group-hover:text-primary">{tapletSubject(p.title)}</h3>
              <p className="mt-1 text-[14px] text-muted-foreground">{p.tasks} Taplets</p>
              <span className="mt-4 inline-flex items-center gap-1 border-t border-border pt-3 text-[14px] font-bold text-primary">
                Open Taplets <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      )}

      <ProFooter />
    </div>
  );
}

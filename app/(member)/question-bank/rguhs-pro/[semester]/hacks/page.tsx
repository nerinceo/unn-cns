import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Brain, LifeBuoy, NotebookPen } from "lucide-react";
import { PRO_HOME, getProOverview, parseSemester, requireProBank, requireSemesterMode } from "@/lib/cns/qbank-pro";
import { PRO_NAME, ProBack, ProFooter, ProHeader } from "@/components/question-bank/pro/ProChrome";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: { semester: string } }) {
  return { title: `Exam Hacks — Semester ${params.semester} — ${PRO_NAME}` };
}

/** Nerusalem Exam Hacks (nerusalem.in exam-hacks/semester-N.html); semester 8 is Clinical Hacks. */
export default async function ProHacksPage({ params }: { params: { semester: string } }) {
  const semester = parseSemester(params.semester);
  if (!semester) notFound();
  const ctx = await requireProBank();
  requireSemesterMode(ctx, semester);
  const c = (await getProOverview()).find((o) => o.semester === semester);
  const clinical = semester === 8;
  const base = `${PRO_HOME}/${semester}/hacks`;

  const cards = [
    { href: `${base}/mnemonics`, icon: Brain, title: "Mnemonics", body: "Memory aids and recall cards.", count: c?.mnemonics ?? 0 },
    {
      href: `${base}/notes`,
      icon: NotebookPen,
      title: clinical ? "Clinical Notes" : "Revision Notes",
      body: clinical ? "Practical clinical learning notes." : "Concise topic-wise revision points.",
      count: c?.notes ?? 0,
    },
    {
      href: `${base}/sos`,
      icon: LifeBuoy,
      title: clinical ? "Clinical SOS" : "Exam SOS",
      body: clinical ? "Quick safety and clinical practice cards." : "Exam help cards for this semester.",
      count: c?.sos ?? 0,
    },
  ].filter((x) => x.count > 0);

  return (
    <div className="space-y-6">
      <ProBack href={`${PRO_HOME}/${semester}`} label={`Semester ${semester}`} />
      <ProHeader
        eyebrow={`Semester ${semester}`}
        title={clinical ? "Clinical Hacks" : "Exam Hacks"}
        subtitle={
          clinical
            ? "Clinical mnemonics, practical notes and quick safety guidance for Semester 8 clinical learning."
            : "Mnemonics, Revision Notes and Exam SOS for focused semester-wise study."
        }
        icon={<Brain className="h-6 w-6" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((x) => (
          <Link
            key={x.href}
            href={x.href}
            className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary ring-1 ring-inset ring-primary/15">
                <x.icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-[17px] font-bold leading-snug group-hover:text-primary">{x.title}</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{x.body}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end border-t border-border pt-3">
              <span className="inline-flex items-center gap-1 text-[14px] font-bold text-primary">
                Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>

      {clinical ? (
        <p className="rounded-xl border border-border bg-muted px-4 py-3 text-[14px] text-slate-700 dark:text-slate-300">
          Semester 8 focuses on clinical practice and internship learning rather than a separate university theory exam. Follow your clinical supervisor and the
          current institutional protocols.
        </p>
      ) : (
        <p className="rounded-xl border border-border bg-muted px-4 py-3 text-[14px] text-slate-700 dark:text-slate-300">
          General exam help is also available:{" "}
          <Link href={`${PRO_HOME}/general-sos`} className="font-semibold text-primary underline underline-offset-2">
            General Exam SOS
          </Link>
          .
        </p>
      )}

      <ProFooter />
    </div>
  );
}

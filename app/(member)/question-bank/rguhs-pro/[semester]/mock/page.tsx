import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, ClipboardCheck, Lock, Mic, SearchX, Sparkles } from "lucide-react";
import { FilterSelect } from "@/components/question-bank/FilterSelect";
import { PRO_HOME, gatedRead, getSampleExams, parseSemester, requireProBank, requireSemesterMode } from "@/lib/cns/qbank-pro";
import { type VivaExam, type WrittenExam, vivaGroupName, writtenSubject } from "@/lib/cns/qbank-pro-exams";
import { PRO_NAME, ProBack, ProFooter, ProHeader, linkBuilder, param } from "@/components/question-bank/pro/ProChrome";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: { semester: string } }) {
  return { title: `Mock Exams — Semester ${params.semester} — ${PRO_NAME}` };
}

/**
 * Mock Exams (nerusalem.in mock-exams.html): written papers and oral vivas
 * for the semester. Each runs on its own page: read the paper, Start, Submit
 * (or let the timer end), then the answer key to evaluate yourself against.
 */
export default async function ProMockPage({
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
  const tab = param(searchParams, "tab") === "viva" ? "viva" : "written";
  const base = `${PRO_HOME}/${semester}/mock`;

  const [writtenAll, vivaAll, samples] = await Promise.all([
    gatedRead<WrittenExam[]>(ctx, "get_written_exam_catalog", {}),
    gatedRead<VivaExam[]>(ctx, "get_viva_exam_catalog", {}),
    getSampleExams(),
  ]);
  const written = (writtenAll ?? []).filter((e) => e.semester === semester);
  const viva = (vivaAll ?? []).filter((e) => e.semester === semester);

  const subjects = Array.from(new Set(written.map((e) => writtenSubject(e.title))));
  const groups = Array.from(new Set(viva.map((e) => e.viva_group_key)));
  const subject = subjects.find((s) => s === param(searchParams, "subject"));
  const group = groups.find((g) => g === param(searchParams, "group"));
  const href = linkBuilder(base, { tab: tab === "viva" ? "viva" : undefined, subject, group });

  const writtenShown = written.filter((e) => !subject || writtenSubject(e.title) === subject);
  const vivaShown = viva.filter((e) => !group || e.viva_group_key === group);
  const freeId = samples[`${tab}:${semester}`];

  const tabClass = (on: boolean) =>
    `flex-1 rounded-lg px-4 py-2.5 text-center text-[15px] font-bold transition-colors ${
      on ? "bg-card text-primary shadow-card" : "text-slate-600 hover:text-primary dark:text-slate-400"
    }`;

  return (
    <div className="space-y-5">
      <ProBack href={`${PRO_HOME}/${semester}`} label={`Semester ${semester}`} />
      <ProHeader
        eyebrow={`Semester ${semester} · Exam practice`}
        title="Mock Exams"
        subtitle="Practise full written papers and oral viva exams under timed exam conditions. The exam starts only when you press Start; the answer key unlocks when you submit or the timer reaches zero."
      />

      {sample && (
        <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/[0.05] p-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          <p className="text-[14px] text-foreground">
            <strong className="font-bold">Free sample:</strong> the first written exam and the first viva of Semester {semester} are free to try.{" "}
            {ctx.access.buyUrl && (
              <a href={ctx.access.buyUrl} className="font-semibold text-primary underline underline-offset-2">
                Buy Semester {semester} or the whole bank
              </a>
            )}{" "}
            to open the rest.
          </p>
        </div>
      )}

      <nav aria-label="Exam type" className="flex gap-1 rounded-xl border border-border bg-muted p-1">
        <Link href={href({ tab: undefined, group: undefined })} className={tabClass(tab === "written")} aria-current={tab === "written" ? "page" : undefined}>
          Written Exams
        </Link>
        <Link href={href({ tab: "viva", subject: undefined })} className={tabClass(tab === "viva")} aria-current={tab === "viva" ? "page" : undefined}>
          Viva Exams
        </Link>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {tab === "written" ? (
          <FilterSelect
            variant="subject"
            allLabel="All subjects"
            allHref={href({ subject: undefined })}
            options={subjects.map((s) => ({ label: s, href: href({ subject: s }), active: s === subject }))}
          />
        ) : (
          <FilterSelect
            variant="category"
            allLabel="All viva groups"
            allHref={href({ group: undefined })}
            widthClass="w-80"
            options={groups.map((g) => ({ label: vivaGroupName(g), href: href({ group: g }), active: g === group }))}
          />
        )}
        <span className="text-[14px] font-semibold text-slate-600 dark:text-slate-400">
          {tab === "written" ? `${writtenShown.length} written exams` : `${vivaShown.length} viva exams`}
        </span>
      </div>

      {(tab === "written" ? writtenShown.length : vivaShown.length) === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <p className="mt-3 text-[16px] font-medium text-slate-700 dark:text-slate-300">
            There are currently no {tab === "written" ? "written" : "viva"} exams for Semester {semester}.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tab === "written"
            ? writtenShown.map((e) => (
                <ExamCard
                  key={e.mock_exam_id}
                  href={`${base}/written/${e.mock_exam_id}`}
                  icon="written"
                  semester={semester}
                  badge={`Mock ${e.mock_number}`}
                  title={e.title}
                  facts={[`${e.total_marks} marks`, `${e.duration_minutes} min`]}
                  locked={sample && e.mock_exam_id !== freeId}
                  free={sample && e.mock_exam_id === freeId}
                  buyUrl={ctx.access.buyUrl}
                />
              ))
            : vivaShown.map((e) => (
                <ExamCard
                  key={e.viva_exam_id}
                  href={`${base}/viva/${e.viva_exam_id}`}
                  icon="viva"
                  semester={semester}
                  badge={`Viva ${e.viva_number}`}
                  title={vivaGroupName(e.viva_group_key)}
                  facts={[`${e.total_questions} questions`, `${e.duration_minutes} min`]}
                  locked={sample && e.viva_exam_id !== freeId}
                  free={sample && e.viva_exam_id === freeId}
                  buyUrl={ctx.access.buyUrl}
                />
              ))}
        </div>
      )}

      <ProFooter />
    </div>
  );
}

function ExamCard({
  href,
  icon,
  semester,
  badge,
  title,
  facts,
  locked,
  free,
  buyUrl,
}: {
  href: string;
  icon: "written" | "viva";
  semester: number;
  badge: string;
  title: string;
  facts: string[];
  locked: boolean;
  free: boolean;
  buyUrl: string | null;
}) {
  const Icon = icon === "written" ? ClipboardCheck : Mic;
  return (
    <article className={`flex flex-col rounded-2xl border bg-card p-5 ${locked ? "border-dashed border-border" : "border-border shadow-card"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[12px] font-bold text-primary ring-1 ring-inset ring-primary/15">Semester {semester}</span>
        <span className="text-[13px] font-bold text-primary">{badge}</span>
      </div>
      <h3 className="mt-3 flex items-start gap-2 text-[17px] font-bold leading-snug">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        {title}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {facts.map((f) => (
          <span key={f} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">
            {f.endsWith("min") && <Clock className="h-3.5 w-3.5" />}
            {f}
          </span>
        ))}
      </div>
      <p className={`mt-3 text-[13px] font-bold ${free ? "text-primary" : "text-success"}`}>{free ? "Free sample" : "Timed self-evaluation"}</p>
      <div className="mt-4 flex-1" />
      {locked ? (
        buyUrl ? (
          <a href={buyUrl} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border text-[14px] font-semibold text-slate-700 hover:border-primary hover:text-primary dark:text-slate-300">
            <Lock className="h-4 w-4" /> Buy to open
          </a>
        ) : (
          <span className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border text-[14px] font-semibold text-slate-400">
            <Lock className="h-4 w-4" /> Not in your access
          </span>
        )
      ) : (
        <Link href={href} className="inline-flex h-10 items-center justify-center rounded-lg bg-primary text-[14px] font-semibold text-primary-foreground hover:opacity-90">
          Open Exam
        </Link>
      )}
    </article>
  );
}

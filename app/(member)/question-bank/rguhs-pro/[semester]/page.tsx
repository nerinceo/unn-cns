import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Brain, ClipboardCheck, FileQuestion, History, Puzzle, Star } from "lucide-react";
import { PRO_HOME, getProOverview, getResume, parseSemester, requireProBank, requireSemesterMode, resumeWhen } from "@/lib/cns/qbank-pro";
import { ContinueCard } from "@/components/question-bank/pro/Progress";
import { PRO_NAME, ProBack, ProFooter } from "@/components/question-bank/pro/ProChrome";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { semester: string } }) {
  return { title: `Semester ${params.semester} — ${PRO_NAME} — Central Nerusalem Space` };
}

/**
 * One semester's sections (nerusalem.in index.html?semester=N). Semester 8 is
 * the clinical internship, so its hacks are "Clinical Hacks"; a section with
 * nothing in it for a semester is not offered.
 */
export default async function ProSemesterPage({ params }: { params: { semester: string } }) {
  const semester = parseSemester(params.semester);
  if (!semester) notFound();
  const ctx = await requireProBank();
  const mode = requireSemesterMode(ctx, semester);
  const [overview, resume] = await Promise.all([getProOverview(), getResume(ctx)]);
  const c = overview.find((o) => o.semester === semester);
  const here = resume.find((r) => r.semester === semester);
  const clinical = semester === 8;
  const base = `${PRO_HOME}/${semester}`;

  const sections = [
    {
      href: `${base}/model`,
      icon: FileQuestion,
      title: "Model Questions & Answers",
      body: "Practice model questions by subject and unit with complete answers.",
      count: c?.model ?? 0,
    },
    {
      href: `${base}/previous`,
      icon: History,
      title: "Previous Years’ Solved Questions",
      body: "Study previous years’ RGUHS university questions with clear solved answers, explanations and available exam tips.",
      count: c?.previous ?? 0,
    },
    {
      href: `${base}/important`,
      icon: Star,
      title: "Most Important Questions & Answers",
      body: "Focus on the highest-priority questions for revision.",
      count: c?.important ?? 0,
    },
    {
      href: `${base}/hacks`,
      icon: Brain,
      title: clinical ? "Nerusalem Clinical Hacks" : "Nerusalem Exam Hacks",
      body: clinical
        ? "Clinical Mnemonics, Clinical Notes and Clinical SOS for internship practice."
        : "Mnemonics, Revision Notes and Exam SOS.",
      count: (c?.mnemonics ?? 0) + (c?.notes ?? 0) + (c?.sos ?? 0),
    },
    {
      href: `${base}/taplets`,
      icon: Puzzle,
      title: "Practice Taplets",
      body: "Explore colourful Taplets, quick questions and interactive challenges.",
      count: c?.taplets ?? 0,
    },
    {
      href: `${base}/mock`,
      icon: ClipboardCheck,
      title: "Mock Exams",
      body: "Attempt Written Exams and Viva Exams.",
      count: (c?.written ?? 0) + (c?.viva ?? 0),
    },
  ].filter((s) => s.count > 0);

  return (
    <div className="space-y-6">
      <ProBack href={PRO_HOME} label="Semesters" />

      <header className="overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8">
        <p className="text-[13px] font-bold uppercase tracking-wider text-white/75">Selected semester</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Semester {semester}</h1>
        {mode === "sample" && (
          <p className="mt-2 text-[14px] text-white/85">
            Free samples — every section opens a preview.{" "}
            {ctx.access.buyUrl && (
              <a href={ctx.access.buyUrl} className="font-semibold underline underline-offset-2">
                Buy Semester {semester} or the whole bank
              </a>
            )}
          </p>
        )}
      </header>

      {here && <ContinueCard href={here.path} label={here.label} when={resumeWhen(here.at)} savedHref={mode === "full" ? `${PRO_HOME}/saved?semester=${semester}` : undefined} />}

      <section className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-semibold">Choose a Section</h2>
        <span className="text-[13px] font-semibold text-muted-foreground">
          {sections.length} {sections.length === 1 ? "section" : "sections"}
        </span>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-primary ring-1 ring-inset ring-primary/15">
                <s.icon className="h-5 w-5" />
              </span>
              <h3 className="text-[17px] font-bold leading-snug group-hover:text-primary">{s.title}</h3>
            </div>
            <p className="mt-3 flex-1 text-[14px] leading-relaxed text-muted-foreground">{s.body}</p>
            <div className="mt-4 flex items-center justify-end border-t border-border pt-3">
              <span className="inline-flex items-center gap-1 text-[14px] font-bold text-primary">
                Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>

      <ProFooter />
    </div>
  );
}

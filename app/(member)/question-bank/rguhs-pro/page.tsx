import Link from "next/link";
import { ArrowRight, BookOpen, Check, FileText, Lock } from "lucide-react";
import { accessDateLabel, canOpenSemester } from "@/lib/cns/qbank-access";
import { PRO_HOME, getProOverview, getProgress, getResume, requireProBank, resumeWhen } from "@/lib/cns/qbank-pro";
import { ContinueCard, ProgressBar } from "@/components/question-bank/pro/Progress";
import { PRO_NAME, ProBack, ProFooter, ProHeader } from "@/components/question-bank/pro/ProChrome";

export const dynamic = "force-dynamic";
export const metadata = { title: `${PRO_NAME} — Central Nerusalem Space` };

/** The RGUHS course page's year bands: the two semesters of a year share a colour. */
const YEAR_BANDS = [
  { bar: "bg-blue-500", chip: "bg-blue-50 text-blue-700 ring-blue-600/20", icon: "text-blue-500" },
  { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", icon: "text-emerald-500" },
  { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-800 ring-amber-600/20", icon: "text-amber-500" },
  { bar: "bg-violet-500", chip: "bg-violet-50 text-violet-700 ring-violet-600/20", icon: "text-violet-500" },
];

/**
 * Question Bank Pro home — choose a semester (nerusalem.in index.html).
 * Each card counts what the semester holds; one not in the member's access
 * opens its free sample when the bank is on sale.
 */
export default async function ProSemestersPage({ searchParams }: { searchParams: { locked?: string } }) {
  const ctx = await requireProBank();
  const { access } = ctx;
  const [overview, progress, resume] = await Promise.all([getProOverview(), getProgress(ctx), getResume(ctx)]);
  const last = resume[0];
  const lockedSemester = Number(searchParams.locked) || null;

  return (
    <div className="space-y-8">
      <ProBack href="/question-bank" label="Question Bank" />

      <ProHeader
        eyebrow="RGUHS · B.Sc Nursing"
        title="Question Bank Pro"
        subtitle="Choose your semester to access Model Questions, Previous Years’ Solved Questions, Most Important Questions, Nerusalem Exam Hacks, Practice Taplets and Mock Exams."
        icon={<BookOpen className="h-6 w-6" />}
      />

      {!access.all || lockedSemester ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-[14px] text-foreground">
            {lockedSemester && !canOpenSemester(access, lockedSemester) ? `Semester ${lockedSemester} isn't in your access yet. ` : ""}
            {access.all
              ? "You have every semester."
              : access.semesters.size === 0
                ? "Open any semester to try its free samples."
                : `You have Semester${access.semesters.size > 1 ? "s" : ""} ${Array.from(access.semesters).sort((a, b) => a - b).join(", ")}. Other semesters open as free samples.`}
            {access.expiresAt && <span className="text-muted-foreground"> Access until {accessDateLabel(access.expiresAt)}.</span>}
          </p>
          {!access.all && access.buyUrl && (
            <a href={access.buyUrl} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Buy more semesters or the whole bank
            </a>
          )}
        </div>
      ) : access.expiresAt ? (
        <p className="text-[14px] text-muted-foreground">Access until {accessDateLabel(access.expiresAt)}.</p>
      ) : null}

      {last && <ContinueCard href={last.path} label={last.label} when={resumeWhen(last.at)} savedHref={`${PRO_HOME}/progress`} />}

      <section className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-semibold">Select Semester</h2>
        <span className="text-[13px] font-semibold text-muted-foreground">Semester 1–8</span>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => {
          const c = overview.find((o) => o.semester === n);
          const questions = (c?.model ?? 0) + (c?.previous ?? 0);
          const band = YEAR_BANDS[Math.ceil(n / 2) - 1];
          const open = canOpenSemester(access, n);
          const p = progress?.semesters.find((x) => x.semester === n);
          return (
            <Link
              key={n}
              href={`${PRO_HOME}/${n}`}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-all hover:border-primary/40 ${
                open ? "border-border shadow-card hover:-translate-y-0.5 hover:shadow-card-hover" : "border-dashed border-border"
              }`}
            >
              <span aria-hidden className={`h-1.5 w-full ${open ? band.bar : "bg-slate-200 dark:bg-slate-700"}`} />
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold tabular-nums ring-1 ring-inset ${
                      open ? band.chip : "bg-muted text-muted-foreground ring-border"
                    }`}
                  >
                    {n}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[16px] font-bold leading-snug group-hover:text-primary">Semester {n}</h3>
                    {open ? (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-success">
                        <Check className="h-3 w-3" />
                        Open
                      </span>
                    ) : (
                      <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        Free samples
                      </span>
                    )}
                  </div>
                </div>
                {open && p && (
                  <div className="mt-3">
                    <ProgressBar done={p.questions_done} total={p.questions_total} size="sm" />
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <span className="inline-flex items-center gap-1.5 text-[14px] font-bold tabular-nums text-foreground">
                    <FileText className={`h-4 w-4 ${open ? band.icon : "text-muted-foreground"}`} />
                    {questions.toLocaleString("en-IN")} questions
                  </span>
                  <span className="inline-flex items-center gap-1 text-[14px] font-bold text-primary">
                    Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <ProFooter />
    </div>
  );
}

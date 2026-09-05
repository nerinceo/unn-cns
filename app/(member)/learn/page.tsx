import Link from "next/link";
import { GraduationCap, ClipboardList, TrendingUp, School } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learn — Central Nursing Systems" };

/**
 * Learn hub — the academic side of CNS.
 *
 * Gathers the existing learning tools under one roof, with courses signposted.
 * The Question Bank is a single tile, not two: MCQs and descriptive questions are
 * formats within it, so listing them as siblings here would re-create exactly
 * the split the bank's own structure removes.
 */
const TOOLS: { href: string; icon: LucideIcon; title: string; body: string; live: boolean }[] = [
  { href: "/question-bank", icon: ClipboardList, title: "Question Bank",
    body: "Your university's bank, semester by semester — MCQs, short answers, essays, clinical viva and case scenarios, each with its answer or model answer.", live: true },
  { href: "/progress", icon: TrendingUp, title: "Progress",
    body: "Your attempts, scores and where to focus next.", live: true },
  { href: "/lms", icon: School, title: "Courses",
    body: "Structured nursing courses taught by verified nurses, with progress saved lecture by lecture.", live: true },
];

export default function LearnHub() {
  return (
    <div className="space-y-10">
      <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold sm:text-3xl">Learn</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Courses, university question banks, exam preparation, clinical learning and advanced
          learning systems.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map(({ href, icon: Icon, title, body, live }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-6 w-6 text-primary" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-medium group-hover:text-primary">{title}</h2>
                {!live && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    Soon
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          </Link>
        ))}
      </section>

    </div>
  );
}

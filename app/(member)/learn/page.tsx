import Link from "next/link";
import { GraduationCap, ClipboardList, BookOpenCheck, TrendingUp, School, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getSubjectsWithSets } from "@/lib/cns/question-bank";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learn — Central Nursing Systems" };

/**
 * Learn hub — the academic side of CNS.
 *
 * Gathers the existing learning tools (question bank, revision, progress) under
 * one roof, with courses and exam preparation signposted. Nothing here is new
 * functionality; it is the front door to what already works.
 */
const TOOLS: { href: string; icon: LucideIcon; title: string; body: string; live: boolean }[] = [
  { href: "/question-bank", icon: ClipboardList, title: "Question Bank",
    body: "University practice sets and past papers, auto-graded with explanations.", live: true },
  { href: "/revision", icon: BookOpenCheck, title: "Revision",
    body: "Model-answer exam questions — essays, viva and case scenarios to study and self-check.", live: true },
  { href: "/progress", icon: TrendingUp, title: "Progress",
    body: "Your attempts, scores and where to focus next.", live: true },
  { href: "/lms", icon: School, title: "Courses",
    body: "Structured nursing courses and clinical learning across connected colleges.", live: false },
];

export default async function LearnHub() {
  const subjects = await getSubjectsWithSets();
  const totalSets = subjects.reduce((n, s) => n + s.sets.length, 0);

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

      {subjects.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Practice sets by subject ({totalSets})
            </h2>
            <Link href="/question-bank" className="flex items-center gap-1 text-sm text-primary hover:underline">
              Open question bank <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.slice(0, 9).map((s) => (
              <Link
                key={s.id}
                href="/question-bank"
                className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
              >
                <h3 className="font-medium group-hover:text-primary">{s.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {s.sets.length} {s.sets.length === 1 ? "set" : "sets"}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

import Link from "next/link";
import { ClipboardList, GraduationCap, ArrowRight, MapPin } from "lucide-react";
import { BANK_DIRECTORY, BANK_IDENTITY, DIRECTORY_COPY } from "@/lib/cns/question-bank-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question Bank — Central Nursing Systems" };

/**
 * One colour per country group, so twenty-two cards read as seven regions
 * rather than one long undifferentiated wall. Keyed by the country string the
 * directory already carries — nothing new is labelled.
 */
const REGION: Record<string, { bar: string; chip: string }> = {
  India: { bar: "bg-blue-500", chip: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  Philippines: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  Africa: { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  USA: { bar: "bg-violet-500", chip: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  Australia: { bar: "bg-rose-500", chip: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  Canada: { bar: "bg-cyan-500", chip: "bg-cyan-50 text-cyan-800 ring-cyan-600/20" },
  UK: { bar: "bg-indigo-500", chip: "bg-indigo-50 text-indigo-700 ring-indigo-600/20" },
};
const REGION_FALLBACK = {
  bar: "bg-slate-400",
  chip: "bg-slate-100 text-slate-700 ring-slate-500/20",
};

/**
 * Nursing Bank root — the university level.
 *
 * All 22 banks from the legacy site are listed, grouped by country, because the
 * directory is the product: a student should see that their university is
 * coming even when it has no content yet. Only RGUHS has questions behind it;
 * the rest land on the access panel at the next level rather than 404ing, which
 * is what the old site did (minus its client-side code check, which gated
 * nothing).
 *
 * Copy is verbatim from lib/cns/question-bank-content.ts — do not edit strings
 * inline here.
 */
export default function QuestionBankPage() {
  return (
    <div className="space-y-10">
      <header className="rounded-2xl border border-border bg-gradient-to-br from-primary/[0.08] via-card to-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ClipboardList className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{BANK_IDENTITY.name}</h1>
        </div>
        <p className="mt-3 text-[15px] font-medium text-muted-foreground">
          {BANK_IDENTITY.tagline}
        </p>
      </header>

      <section>
        <h2 className="text-xl font-semibold">{DIRECTORY_COPY.heading}</h2>
        <p className="mt-2 max-w-3xl text-muted-foreground">{DIRECTORY_COPY.subtitle}</p>
      </section>

      {BANK_DIRECTORY.map((group) => (
        <section key={group.country}>
          <h3 className="mb-4 flex items-center gap-2.5 text-[13px] font-bold uppercase tracking-wider text-foreground">
            <span
              aria-hidden
              className={`h-4 w-1 rounded-full ${(REGION[group.country] ?? REGION_FALLBACK).bar}`}
            />
            {group.country}
            <span aria-hidden className="h-px flex-1 bg-border" />
          </h3>
          {/* Three columns, not four. Each country is its own grid, and the
              group sizes are 4/3/3/3/3/2/2 — at four columns every group but
              India left one or two dead cells and squeezed the cards narrow.
              At three, four of the seven groups fill their row exactly. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.banks.map((bank) => {
              const tone = REGION[group.country] ?? REGION_FALLBACK;

              return (
                <Link
                  key={bank.key}
                  href={`/question-bank/${bank.key}`}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover"
                >
                  <span aria-hidden className={`h-1.5 w-full ${tone.bar}`} />

                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${tone.chip}`}
                      >
                        <GraduationCap className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-[15px] font-bold leading-snug group-hover:text-primary">
                          {bank.name}
                        </h4>
                        <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {bank.location}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 flex-1 text-[13px] leading-relaxed text-muted-foreground">
                      {bank.description}
                    </p>

                    <span className="mt-4 inline-flex items-center justify-between gap-1.5 border-t border-border pt-3 text-[13px] font-bold text-primary">
                      {DIRECTORY_COPY.cardCta}
                      <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

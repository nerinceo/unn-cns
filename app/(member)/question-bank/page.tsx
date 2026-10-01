import Link from "next/link";
import { ClipboardList, GraduationCap, ArrowRight, MapPin, Clock } from "lucide-react";
import { getInstitutions } from "@/lib/cns/question-bank";
import {
  ACCESS_COPY,
  BANK_DIRECTORY,
  BANK_IDENTITY,
  DIRECTORY_COPY,
} from "@/lib/cns/question-bank-content";

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
 * the rest render as "Coming Soon" cards (partner-college access, not yet
 * open) and their URLs show the same state rather than 404ing.
 *
 * Copy is verbatim from lib/cns/question-bank-content.ts — do not edit strings
 * inline here.
 */
export default async function QuestionBankPage() {
  // A bank is open when its university has a cns_institutions row — the same
  // test the institution page uses. Read failure returns [] (getInstitutions
  // swallows it); in that case nothing is known, so every card stays a link
  // and the institution page decides, rather than RGUHS flipping to "Coming
  // Soon" because of a transient error.
  const institutions = await getInstitutions();
  const live = new Set(institutions.map((i) => i.slug));
  const isOpen = (key: string) => live.size === 0 || live.has(key);

  return (
    <div className="space-y-10">
      <header className="rounded-2xl border border-border bg-gradient-to-br from-primary/[0.08] via-card to-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ClipboardList className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{BANK_IDENTITY.name}</h1>
        </div>
        <p className="mt-3 text-[16px] font-medium text-muted-foreground">
          {BANK_IDENTITY.tagline}
        </p>
      </header>

      <section>
        <h2 className="text-xl font-semibold">{DIRECTORY_COPY.heading}</h2>
        <p className="mt-2 max-w-3xl text-muted-foreground">{DIRECTORY_COPY.subtitle}</p>
      </section>

      {BANK_DIRECTORY.map((group) => (
        <section key={group.country}>
          <h3 className="mb-4 flex items-center gap-2.5 text-[14px] font-bold uppercase tracking-wider text-foreground">
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.banks.map((bank) => {
              const tone = REGION[group.country] ?? REGION_FALLBACK;
              const open = isOpen(bank.key);

              const body = (
                <>
                  {/* Open banks keep their region colour; coming-soon ones go
                      neutral, so "what can I open" is answerable at a glance —
                      the same convention as the course picker one level down. */}
                  <span
                    aria-hidden
                    className={`h-1.5 w-full ${open ? tone.bar : "bg-slate-200 dark:bg-slate-700"}`}
                  />

                  <div className="flex flex-1 flex-col p-6">
                    <div className="flex items-start gap-3.5">
                      <span
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
                          open ? tone.chip : "bg-muted text-muted-foreground ring-border"
                        }`}
                      >
                        <GraduationCap className="h-6 w-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4
                          className={`text-[17px] font-bold leading-snug ${
                            open ? "group-hover:text-primary" : "text-foreground/80"
                          }`}
                        >
                          {bank.name}
                        </h4>
                        <p className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {bank.location}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 flex-1 text-[14px] leading-relaxed text-muted-foreground">
                      {bank.description}
                    </p>

                    {open ? (
                      <span className="mt-5 inline-flex items-center justify-between gap-1.5 border-t border-border pt-4 text-[14px] font-bold text-primary">
                        {DIRECTORY_COPY.cardCta}
                        <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                      </span>
                    ) : (
                      <span className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-4">
                        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-warning-soft px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide text-warning">
                          <Clock className="h-3.5 w-3.5" />
                          {ACCESS_COPY.badge}
                        </span>
                        <span className="truncate text-[13px] font-medium text-muted-foreground">
                          {DIRECTORY_COPY.comingSoonCta}
                        </span>
                      </span>
                    )}
                  </div>
                </>
              );

              return open ? (
                <Link
                  key={bank.key}
                  href={`/question-bank/${bank.key}`}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40"
                >
                  {body}
                </Link>
              ) : (
                <div
                  key={bank.key}
                  aria-disabled
                  className="relative flex flex-col overflow-hidden rounded-2xl border border-dashed border-border bg-card"
                >
                  {body}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

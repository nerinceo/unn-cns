import Link from "next/link";
import { ClipboardList, GraduationCap, ArrowRight } from "lucide-react";
import { BANK_DIRECTORY, BANK_IDENTITY, DIRECTORY_COPY } from "@/lib/cns/question-bank-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question Bank — Central Nursing Systems" };

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
      <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold sm:text-3xl">{BANK_IDENTITY.name}</h1>
        </div>
        <p className="mt-2 text-muted-foreground">{BANK_IDENTITY.tagline}</p>
      </header>

      <section>
        <h2 className="text-xl font-semibold">{DIRECTORY_COPY.heading}</h2>
        <p className="mt-2 max-w-3xl text-muted-foreground">{DIRECTORY_COPY.subtitle}</p>
      </section>

      {BANK_DIRECTORY.map((group) => (
        <section key={group.country}>
          <h3 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {group.country}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.banks.map((bank) => (
              <Link
                key={bank.key}
                href={`/question-bank/${bank.key}`}
                className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <GraduationCap className="h-5 w-5 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <h4 className="font-medium leading-snug group-hover:text-primary">
                      {bank.name}
                    </h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">{bank.location}</p>
                  </div>
                </div>

                <p className="mt-3 flex-1 text-sm text-muted-foreground">{bank.description}</p>

                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  {DIRECTORY_COPY.cardCta}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

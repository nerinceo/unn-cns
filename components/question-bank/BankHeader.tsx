import Link from "next/link";
import { ChevronRight, GraduationCap } from "lucide-react";
import type { CnsInstitution } from "@/lib/cns/question-bank";

/**
 * The Question Bank's one header, scoped to a university.
 *
 * All content is owned by an institution, so the browse tree is
 * university → format → subject and this header is the university level made
 * visible. The tab row is the only navigation between formats, and is rendered
 * by the browse pages rather than by a layout — a layout would put navigation
 * chrome on the timed attempt runner.
 */

export type BankTab = "overview" | "mcq" | "descriptive";

export function BankHeader({
  institution,
  active,
  description,
}: {
  institution: CnsInstitution;
  active: BankTab;
  description: string;
}) {
  const base = `/question-bank/${institution.slug}`;
  const tabs: { key: BankTab; href: string; label: string }[] = [
    { key: "overview", href: base, label: "Overview" },
    { key: "mcq", href: `${base}/mcq`, label: "MCQs" },
    { key: "descriptive", href: `${base}/descriptive`, label: "Descriptive" },
  ];

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
        >
          <Link href="/question-bank" className="hover:text-foreground">
            Question Bank
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{institution.short_name ?? institution.name}</span>
        </nav>

        <div className="mt-3 flex items-start gap-3">
          <GraduationCap className="mt-0.5 h-7 w-7 shrink-0 text-primary" />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold sm:text-3xl">
              {institution.short_name ?? institution.name}
            </h1>
            {institution.short_name && (
              <p className="mt-0.5 text-sm text-muted-foreground">{institution.name}</p>
            )}
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-muted-foreground">{description}</p>
      </header>

      <nav aria-label="Question Bank sections" className="border-b border-border">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const current = t.key === active;
            return (
              <li key={t.key}>
                <Link
                  href={t.href}
                  aria-current={current ? "page" : undefined}
                  className={`inline-block whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    current
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

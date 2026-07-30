import Link from "next/link";
import { ClipboardList } from "lucide-react";

/**
 * The Question Bank's one header.
 *
 * MCQs and revision questions used to live at two unrelated top-level routes,
 * so a learner had no way to see that they are the same bank asked two ways.
 * Both now sit under /question-bank behind this shared header, and the tab row
 * is the only navigation between them — rendered on the browse pages only, so a
 * timed attempt stays distraction-free.
 */

export type BankTab = "overview" | "mcq" | "revision";

const TABS: { key: BankTab; href: string; label: string }[] = [
  { key: "overview", href: "/question-bank", label: "Overview" },
  { key: "mcq", href: "/question-bank/mcq", label: "MCQs" },
  { key: "revision", href: "/question-bank/revision", label: "Revision" },
];

export function BankHeader({ active, description }: { active: BankTab; description: string }) {
  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold sm:text-3xl">Question Bank</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>
      </header>

      <nav aria-label="Question Bank sections" className="border-b border-border">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
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

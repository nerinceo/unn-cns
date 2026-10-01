import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getStudySubjects } from "@/lib/cns/study";
import { getInstitutionBySlug } from "@/lib/cns/question-bank";
import { BankHeader } from "@/components/question-bank/BankHeader";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ institution: string }> }) {
  const inst = await getInstitutionBySlug((await params).institution);
  return { title: `Descriptive — ${inst?.short_name ?? "Question Bank"} — Central Nursing Systems` };
}

/**
 * Descriptive half of one university's bank: written exam questions with model
 * answers. The same bank asked a different way, not a separate system.
 */
export default async function DescriptivePage({
  params,
}: {
  params: Promise<{ institution: string }>;
}) {
  const { institution: slug } = await params;
  const institution = await getInstitutionBySlug(slug);
  if (!institution) notFound();

  const subjects = await getStudySubjects(institution.id);
  const total = subjects.reduce((n, s) => n + s.count, 0);
  const base = `/question-bank/${institution.slug}`;

  // Group by year of study so a nurse sees their year's subjects together.
  const byYear = new Map<number, typeof subjects>();
  for (const s of subjects) {
    const y = s.year_of_study ?? 0;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(s);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-8">
      <BankHeader
        institution={institution}
        active="descriptive"
        description={`${total.toLocaleString()} questions answered in your own words rather than by picking an option — essays, short answers, clinical viva, case scenarios, care plans and practicals. Work the question through, then reveal the model answer to check yourself.`}
      />

      {subjects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No descriptive questions yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            They appear here once staff publish them.
          </p>
        </div>
      ) : (
        years.map((year) => (
          <section key={year}>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {year ? `Year ${year}` : "General"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {byYear.get(year)!.map((s) => (
                <Link
                  key={s.id}
                  href={`${base}/descriptive/${s.id}`}
                  className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary"
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-medium group-hover:text-primary">{s.name}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {s.count} {s.count === 1 ? "question" : "questions"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

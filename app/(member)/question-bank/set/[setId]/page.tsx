import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Clock, FileText, Target, AlertTriangle } from "lucide-react";
import { getQuestionSet, getSetQuestionCount, getInstitutionById } from "@/lib/cns/question-bank";
import { StartAttemptButton } from "@/components/question-bank/StartAttemptButton";

export const dynamic = "force-dynamic";

export default async function SetPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;
  const set = await getQuestionSet(setId);
  if (!set) notFound();

  const [questionCount, institution] = await Promise.all([
    getSetQuestionCount(setId),
    getInstitutionById(set.institution_id),
  ]);
  const negativeMarking = true; // surfaced per-question; flagged here as a heads-up

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* A set is reachable from several places, so the trail names its owner
          rather than assuming where the learner came from. */}
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/question-bank" className="hover:text-foreground">
          Question Bank
        </Link>
        {institution && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href={`/question-bank/${institution.slug}`} className="hover:text-foreground">
              {institution.short_name ?? institution.name}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href={`/question-bank/${institution.slug}/mcq`} className="hover:text-foreground">
              MCQs
            </Link>
          </>
        )}
      </nav>

      <header>
        <h1 className="text-2xl font-semibold">{set.title}</h1>
        {set.description && <p className="mt-2 text-muted-foreground">{set.description}</p>}
      </header>

      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-4">
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Questions
          </dt>
          <dd className="mt-1 text-lg font-medium">{questionCount}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Target className="h-3.5 w-3.5" /> Total marks
          </dt>
          <dd className="mt-1 text-lg font-medium">{set.total_marks ?? "—"}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Duration
          </dt>
          <dd className="mt-1 text-lg font-medium">
            {set.duration_minutes ? `${set.duration_minutes} min` : "Untimed"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Pass mark</dt>
          <dd className="mt-1 text-lg font-medium">
            {set.pass_percentage != null ? `${set.pass_percentage}%` : "—"}
          </dd>
        </div>
      </dl>

      {negativeMarking && (
        <div className="flex gap-3 rounded-lg border border-border bg-muted p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
          <div className="text-sm">
            <p className="font-medium">Negative marking applies</p>
            <p className="mt-0.5 text-muted-foreground">
              Wrong answers lose marks; skipped questions do not. Your total can never fall below
              zero. Answers and explanations appear{" "}
              {set.show_answers_mode === "immediately" ? "as you go" : "after you submit"}.
            </p>
          </div>
        </div>
      )}

      <StartAttemptButton setId={set.id} disabled={questionCount === 0} />
    </div>
  );
}

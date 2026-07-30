import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, FileText } from "lucide-react";
import { getStudySubject, getStudyQuestions, getStudyTypes } from "@/lib/cns/study";
import { getInstitutionBySlug, getSubjectsWithSets } from "@/lib/cns/question-bank";
import { StudyCard } from "@/components/question-bank/StudyCard";

export const dynamic = "force-dynamic";

export default async function DescriptiveSubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ institution: string; subjectId: string }>;
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const { institution: slug, subjectId } = await params;
  const sp = await searchParams;
  const type = sp.type || undefined;
  const page = Number(sp.page ?? 0) || 0;

  const institution = await getInstitutionBySlug(slug);
  if (!institution) notFound();

  const [subject, types, { questions, total, pageSize }, bankSubjects] = await Promise.all([
    getStudySubject(subjectId),
    getStudyTypes(subjectId),
    getStudyQuestions({ subjectId, type, page }),
    getSubjectsWithSets(institution.id),
  ]);
  if (!subject) notFound();

  // The subject must actually belong to the university in the URL. Without
  // this, /question-bank/kuhs/descriptive/<an-rguhs-subject> would render RGUHS
  // content under someone else's breadcrumb once a second university exists.
  if (subject.institution_id !== institution.id) notFound();

  // The same subject's MCQ side, so a learner can switch format without going
  // back up two levels.
  const mcqSets = bankSubjects.find((s) => s.id === subjectId)?.sets ?? [];
  const base = `/question-bank/${institution.slug}`;
  const mcqHref =
    mcqSets.length === 1 ? `/question-bank/set/${mcqSets[0].id}` : `${base}/mcq?subject=${subjectId}`;

  const pages = Math.ceil(total / pageSize);
  const qs = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    if (type) p.set("type", type);
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-6">
      <div>
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
        >
          <Link href="/question-bank" className="hover:text-foreground">
            Question Bank
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href={base} className="hover:text-foreground">
            {institution.short_name ?? institution.name}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href={`${base}/descriptive`} className="hover:text-foreground">
            Descriptive
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{subject.name as string}</span>
        </nav>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{subject.name as string}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{total} descriptive questions</p>
          </div>
          {mcqSets.length > 0 && (
            <Link
              href={mcqHref}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
            >
              <FileText className="h-4 w-4" />
              {mcqSets.length === 1 ? "Practice MCQs" : `Practice MCQs (${mcqSets.length} sets)`}
            </Link>
          )}
        </div>
      </div>

      {/* Type filter — the source has many kinds (Short Essay, Clinical Viva…). */}
      {types.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${base}/descriptive/${subjectId}`}
            className={`rounded-full border px-3 py-1 text-sm ${!type ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary"}`}
          >
            All
          </Link>
          {types.map((t) => (
            <Link
              key={t.type}
              href={`${base}/descriptive/${subjectId}?type=${encodeURIComponent(t.type)}`}
              className={`rounded-full border px-3 py-1 text-sm ${type === t.type ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary"}`}
            >
              {t.type} <span className="text-xs opacity-70">{t.count}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {questions.map((q) => (
          <StudyCard
            key={q.id}
            stem={q.stem}
            modelAnswer={q.model_answer}
            rationale={q.rationale}
            examTip={q.exam_tip}
            diagramNote={q.diagram_note}
            type={q.source_question_type}
            marks={q.marks}
          />
        ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
          {page > 0 ? (
            <Link
              href={`${base}/descriptive/${subjectId}${qs({ page: page - 1 })}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {page + 1} of {pages}
          </span>
          {page < pages - 1 ? (
            <Link
              href={`${base}/descriptive/${subjectId}${qs({ page: page + 1 })}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}

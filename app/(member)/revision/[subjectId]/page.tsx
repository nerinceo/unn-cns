import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getStudySubject, getStudyQuestions, getStudyTypes } from "@/lib/cns/study";
import { StudyCard } from "@/components/question-bank/StudyCard";

export const dynamic = "force-dynamic";

export default async function RevisionSubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const { subjectId } = await params;
  const sp = await searchParams;
  const type = sp.type || undefined;
  const page = Number(sp.page ?? 0) || 0;

  const [subject, types, { questions, total, pageSize }] = await Promise.all([
    getStudySubject(subjectId),
    getStudyTypes(subjectId),
    getStudyQuestions({ subjectId, type, page }),
  ]);
  if (!subject) notFound();

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
        <Link href="/revision" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All subjects
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{subject.name as string}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{total} revision questions</p>
      </div>

      {/* Type filter — the source has many kinds (Short Essay, Clinical Viva…). */}
      {types.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/revision/${subjectId}`}
            className={`rounded-full border px-3 py-1 text-sm ${!type ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary"}`}
          >
            All
          </Link>
          {types.map((t) => (
            <Link
              key={t.type}
              href={`/revision/${subjectId}?type=${encodeURIComponent(t.type)}`}
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
            <Link href={`/revision/${subjectId}${qs({ page: page - 1 })}`} className="text-primary hover:underline">
              ← Previous
            </Link>
          ) : <span />}
          <span className="text-muted-foreground">Page {page + 1} of {pages}</span>
          {page < pages - 1 ? (
            <Link href={`/revision/${subjectId}${qs({ page: page + 1 })}`} className="text-primary hover:underline">
              Next →
            </Link>
          ) : <span />}
        </div>
      )}
    </div>
  );
}

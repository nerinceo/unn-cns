import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getStudySubject, getStudyQuestions, getStudyTypes } from "@/lib/cns/study";
import { getInstitutionBySlug } from "@/lib/cns/question-bank";
import { canOpenSemester, getBankAccess } from "@/lib/cns/qbank-access";
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

  const subject = await getStudySubject(subjectId);
  if (!subject) notFound();

  // The subject must actually belong to the university in the URL. Without
  // this, /question-bank/kuhs/descriptive/<an-rguhs-subject> would render RGUHS
  // content under someone else's breadcrumb once a second university exists.
  if (subject.institution_id !== institution.id) notFound();

  // Paid access (0080): the subject's semester must be one the buyer holds —
  // checked BEFORE the questions are fetched.
  if (!canOpenSemester(await getBankAccess(slug), subject.semester))
    redirect(`/question-bank/${slug}/descriptive?locked=1`);

  const [types, { questions, total, pageSize }] = await Promise.all([
    getStudyTypes(subjectId),
    getStudyQuestions({ subjectId, type, page }),
  ]);

  const base = `/question-bank/${institution.slug}`;

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

        <div className="mt-3">
          <h1 className="text-2xl font-semibold">{subject.name as string}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} descriptive questions</p>
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

import { notFound, redirect } from "next/navigation";
import { getStudySubject } from "@/lib/cns/study";
import { getInstitutions } from "@/lib/cns/question-bank";

export const dynamic = "force-dynamic";

/**
 * Institution-agnostic permalink for a subject.
 *
 * The bank moved to /question-bank/<university>/revision/<subjectId>, but
 * /revision/<subjectId> links have existed since CNS launched and a subject id
 * alone does not say which university owns it. Rather than dump every old
 * bookmark on the landing page, this resolves the owner and forwards to the
 * canonical URL. next.config.mjs points the legacy paths here.
 *
 * A static segment beats the sibling [institution] segment in Next's route
 * matching, so "subject" can never be mistaken for a university slug.
 */
export default async function SubjectPermalink({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;

  const subject = await getStudySubject(subjectId);
  if (!subject) notFound();

  const institutions = await getInstitutions();
  const owner = institutions.find((i) => i.id === subject.institution_id);
  if (!owner) notFound();

  redirect(`/question-bank/${owner.slug}/revision/${subjectId}`);
}

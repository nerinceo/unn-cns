import { notFound, redirect } from "next/navigation";
import { getPlayerData } from "@/lib/cns/lms";
import { CoursePlayer } from "@/components/lms/CoursePlayer";
import { sanitizeRichText } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getPlayerData(slug);
  return { title: data ? `${data.course.title} — CNS` : "Course — CNS" };
}

export default async function CoursePlayerPage({
  params,
}: {
  params: Promise<{ slug: string; lectureId: string }>;
}) {
  const { slug, lectureId } = await params;

  const data = await getPlayerData(slug);
  if (!data) notFound();

  const current = data.sections.flatMap((s) => s.lectures).find((l) => l.id === lectureId);
  if (!current) notFound();

  // A locked lecture is visible in the curriculum but not openable. Send the
  // learner back to the entry point rather than rendering a player that cannot
  // play — getPlayerData already stripped the content, so there is nothing to
  // show even if we tried.
  if (current.locked) redirect(`/lms/${slug}`);

  // Sanitise at RENDER as well as at write. CoursePlayer injects lecture HTML
  // with dangerouslySetInnerHTML, and a course owner can write
  // lms_lectures.content straight through the REST API (lms_lectures_write),
  // skipping the write-time sanitizeRichText in lib/actions/lms-courses.ts — so
  // an instructor could run script in every learner's session. Same allowlist
  // as the write path, so content saved through the app is unchanged (checked
  // against production 2026-09-28: 0 of 11 lectures with content differ).
  const safeData = {
    ...data,
    sections: data.sections.map((s) => ({
      ...s,
      lectures: s.lectures.map((l) =>
        l.content ? { ...l, content: sanitizeRichText(l.content) } : l
      ),
    })),
  };

  return <CoursePlayer data={safeData} currentLectureId={current.id} slug={slug} />;
}

import { notFound, redirect } from "next/navigation";
import { getPlayerData } from "@/lib/cns/lms";
import { CoursePlayer } from "@/components/lms/CoursePlayer";

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

  return <CoursePlayer data={data} currentLectureId={current.id} slug={slug} />;
}

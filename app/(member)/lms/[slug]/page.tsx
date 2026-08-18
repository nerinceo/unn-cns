import { notFound, redirect } from "next/navigation";
import { getPlayerData } from "@/lib/cns/lms";

export const dynamic = "force-dynamic";

/**
 * Course entry point. Resolves where the learner should actually be — the first
 * lecture they have not finished, else the first one they can open — and
 * redirects. Keeping this resolution server-side means the player route always
 * receives a concrete lecture and never has to render an empty state.
 */
export default async function CourseEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getPlayerData(slug);
  if (!data) notFound();

  const lectures = data.sections.flatMap((s) => s.lectures);
  const openable = lectures.filter((l) => !l.locked);
  const target = openable.find((l) => !l.completed) ?? openable[0];

  // Nothing this learner can open: either the course has no lectures yet, or
  // they have no entitlement and the instructor published no free preview.
  if (!target) notFound();

  redirect(`/lms/${slug}/${target.id}`);
}

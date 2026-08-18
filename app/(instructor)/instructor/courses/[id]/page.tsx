import { notFound } from "next/navigation";
import { getCourseForEdit } from "@/lib/actions/lms-courses";
import { CourseBuilder } from "@/components/lms/CourseBuilder";

export const dynamic = "force-dynamic";

/**
 * The course builder. Landing page and curriculum — no pricing step: a course
 * is sold as a HUB marketplace listing, so price belongs with the listing.
 *
 * getCourseForEdit() is owner-scoped and returns null for anyone else, so the
 * 404 below is the access check — there is no separate ownership branch to keep
 * in sync with it.
 */
export default async function CourseBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const course = await getCourseForEdit(id);
  if (!course) notFound();

  return <CourseBuilder course={course} />;
}

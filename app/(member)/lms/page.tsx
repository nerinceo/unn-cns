import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  PlayCircle,
  ShoppingBag,
} from "lucide-react";
import { getMyCourses } from "@/lib/cns/lms";
import { formatCourseLength } from "@/lib/lms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Courses — Central Nerusalem Space" };

/** Where courses are bought. CNS delivers them; HUB's marketplace sells them. */
const MARKETPLACE_URL =
  process.env.NEXT_PUBLIC_HUB_URL
    ? `${process.env.NEXT_PUBLIC_HUB_URL.replace(/\/+$/, "")}/marketplace?delivery=course`
    : "https://unn.nerusalem.com/marketplace?delivery=course";

/**
 * Courses — the learner's shelf.
 *
 * Deliberately shows only what this learner already has access to. There is no
 * catalogue here: browsing and buying happen in the UNN marketplace, and
 * duplicating a storefront in CNS would mean two places quoting a price, which
 * is precisely how the two drift. Enrolment arrives from HUB's Stripe webhook.
 */
export default async function LmsPage() {
  const courses = await getMyCourses();
  const inProgress = courses.filter((c) => !c.completedAt);
  const completed = courses.filter((c) => c.completedAt);

  return (
    <div className="space-y-8">
      <header className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <GraduationCap className="h-7 w-7 text-primary" />
              <h1 className="text-2xl font-semibold sm:text-3xl">Courses</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Structured nursing courses taught by verified nurses. Your progress is saved as
              you go, and access does not expire.
            </p>
          </div>
          <a
            href={MARKETPLACE_URL}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <ShoppingBag className="h-4 w-4" />
            Find courses
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </header>

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="mb-1 text-sm font-medium">No courses yet</p>
          <p className="mx-auto mb-5 max-w-md text-sm text-muted-foreground">
            Courses you buy on the Nerusalem marketplace appear here automatically, with your
            progress tracked lecture by lecture.
          </p>
          <a
            href={MARKETPLACE_URL}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <ShoppingBag className="h-4 w-4" />
            Browse courses
          </a>
        </div>
      ) : (
        <div className="space-y-10">
          {inProgress.length > 0 && <CourseSection title="In progress" rows={inProgress} />}
          {completed.length > 0 && <CourseSection title="Completed" rows={completed} />}
        </div>
      )}
    </div>
  );
}

function CourseSection({
  title,
  rows,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof getMyCourses>>;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="space-y-3">
        {rows.map(({ course, progressPercent, completedAt, certificateNo }) => (
          <div
            key={course.id}
            className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center"
          >
            <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-40">
              {course.cover_url ? (
                <Image
                  src={course.cover_url}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 160px"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center">
                  <BookOpen className="h-6 w-6 text-muted-foreground/40" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="mb-0.5 text-[12px] font-medium text-primary">{course.category}</p>
              <h3 className="text-sm font-semibold">{course.title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {course.instructor?.display_name ?? "Nerusalem instructor"} · {course.lecture_count}{" "}
                lectures ·{" "}
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatCourseLength(course.total_duration_s)}
                </span>
              </p>

              <div className="mt-2.5 max-w-sm">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="mt-1 text-[12px] tabular-nums text-muted-foreground">
                  {completedAt ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Completed
                    </span>
                  ) : (
                    `${progressPercent}% complete`
                  )}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {certificateNo && (
                <Link
                  href={`/lms/certificate/${certificateNo}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <Award className="h-4 w-4 text-primary" />
                  Certificate
                </Link>
              )}
              <Link
                href={`/lms/${course.slug}`}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <PlayCircle className="h-4 w-4" />
                {completedAt ? "Revisit" : progressPercent > 0 ? "Continue" : "Start"}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

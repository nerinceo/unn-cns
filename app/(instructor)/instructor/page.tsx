import Link from "next/link";
import Image from "next/image";
import { BookOpen, Clock, Plus, Star, Users } from "lucide-react";
import { getMyInstructor, getMyAuthoredCourses } from "@/lib/cns/lms";
import { getSellerReadiness } from "@/lib/cns/lms-sales";
import { SellerProgress } from "@/components/lms/SellerProgress";
import { sellerReadiness, formatCourseLength } from "@/lib/lms";

export const dynamic = "force-dynamic";
export const metadata = { title: "My courses — Central Nursing Systems" };

const STATUS: Record<string, { text: string; className: string }> = {
  draft: { text: "Draft", className: "bg-muted text-muted-foreground" },
  pending: { text: "In review", className: "bg-amber-50 text-amber-700" },
  approved: { text: "Live", className: "bg-emerald-50 text-emerald-700" },
  needs_info: { text: "Changes requested", className: "bg-blue-50 text-blue-700" },
  rejected: { text: "Not approved", className: "bg-red-50 text-red-700" },
  unpublished: { text: "Unpublished", className: "bg-muted text-muted-foreground" },
};

export default async function InstructorDashboard() {
  // The layout already established that this is an approved instructor.
  const instructor = (await getMyInstructor())!;
  const [courses, payouts] = await Promise.all([
    getMyAuthoredCourses(instructor.id),
    getSellerReadiness(),
  ]);

  // One model, shared with the settings page and the sales page, so the three
  // can never disagree about what is still outstanding.
  const readiness = sellerReadiness({
    status: instructor.status,
    displayName: instructor.display_name,
    headline: instructor.headline,
    bio: instructor.bio,
    expertise: instructor.expertise,
    agreementAcceptedAt: instructor.agreement_accepted_at,
    documents: instructor.documents,
    payoutsConnected: payouts.payoutsConnected,
    approvedCourseCount: courses.filter((c) => c.status === "approved").length,
    hasPaidCourse: courses.some((c) => (c.price ?? 0) > 0),
  });

  const live = courses.filter((c) => c.status === "approved").length;
  const enrollments = courses.reduce((n, c) => n + (c.enrollment_count ?? 0), 0);
  const rated = courses.filter((c) => (c.rating_count ?? 0) > 0);
  const avgRating =
    rated.length > 0
      ? rated.reduce((n, c) => n + (c.rating_avg ?? 0) * (c.rating_count ?? 0), 0) /
        rated.reduce((n, c) => n + (c.rating_count ?? 0), 0)
      : null;

  const stats = [
    { label: "Live courses", value: String(live), icon: BookOpen },
    { label: "Learners", value: String(enrollments), icon: Users },
    { label: "Average rating", value: avgRating ? avgRating.toFixed(1) : "—", icon: Star },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">My courses</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {instructor.display_name}
            {instructor.headline ? ` · ${instructor.headline}` : ""}
          </p>
        </div>
        <Link
          href="/instructor/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New course
        </Link>
      </header>

      <SellerProgress
        steps={readiness.steps}
        percent={readiness.percent}
        doneCount={readiness.doneCount}
        canSell={readiness.canSell}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <s.icon className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
            <p className="text-lg font-semibold">{s.value}</p>
          </div>
        ))}
      </div>

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="mb-1 text-sm font-medium">No courses yet</p>
          <p className="mx-auto mb-5 max-w-md text-sm text-muted-foreground">
            Start with one focused course. You can save a draft and come back to it.
          </p>
          <Link
            href="/instructor/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Create your first course
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {courses.map((c) => {
            const badge = STATUS[c.status] ?? STATUS.draft;
            return (
              <li key={c.id}>
                <Link
                  href={`/instructor/courses/${c.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
                >
                  <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {c.cover_url ? (
                      <Image src={c.cover_url} alt="" fill className="object-cover" sizes="112px" />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center">
                        <BookOpen className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.lecture_count} lectures ·{" "}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatCourseLength(c.total_duration_s)}
                      </span>
                      {c.enrollment_count > 0 ? ` · ${c.enrollment_count} enrolled` : ""}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                  >
                    {badge.text}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

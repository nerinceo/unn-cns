"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  DollarSign,
  Layers,
  Loader2,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import { LandingStep } from "./builder/LandingStep";
import { CurriculumStep } from "./builder/CurriculumStep";
import { PricingStep } from "./builder/PricingStep";
import {
  submitCourseForReview,
  unpublishCourse,
  deleteCourse,
  type CourseForEdit,
} from "@/lib/actions/lms-courses";
import { courseReadiness } from "@/lib/lms";

const STEPS = [
  { key: "landing", label: "Landing page", icon: Settings2 },
  { key: "curriculum", label: "Curriculum", icon: Layers },
  { key: "pricing", label: "Pricing", icon: DollarSign },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const STATUS_BANNER: Record<string, { title: string; tone: string; body: string } | undefined> = {
  pending: {
    title: "In review",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    body: "The UNN team is reviewing this course. You can keep editing — changes save straight away.",
  },
  approved: {
    title: "Live",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    body: "Approved and on sale in the UNN marketplace. Sales appear in your Sales tab.",
  },
  needs_info: {
    title: "Changes requested",
    tone: "border-blue-200 bg-blue-50 text-blue-800",
    body: "Make the changes below, then submit again.",
  },
  rejected: {
    title: "Not approved",
    tone: "border-red-200 bg-red-50 text-red-800",
    body: "This course wasn't approved. Read the note, then resubmit once it's addressed.",
  },
  unpublished: {
    title: "Unpublished",
    tone: "border-border bg-muted text-muted-foreground",
    body: "Hidden from the marketplace. Enrolled learners keep their access.",
  },
};

const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50";
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const btnOutline = `${btn} border border-border bg-background hover:bg-muted`;

export function CourseBuilder({ course }: { course: CourseForEdit }) {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>("landing");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const allLectures = useMemo(
    () => course.sections.flatMap((s) => s.lectures),
    [course.sections],
  );

  // The same function the server re-runs on submit, so the sidebar can never
  // promise something the gate then refuses.
  const { items, ready, doneCount } = useMemo(
    () => courseReadiness(course, allLectures),
    [course, allLectures],
  );

  const banner = STATUS_BANNER[course.status];
  const isLive = course.status === "approved";
  const canSubmit = ready && !isLive && course.status !== "pending";

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const result = await action();
      if (result?.error) {
        setError(result.error);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/instructor"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          My courses
        </Link>
        <h1 className="truncate text-xl font-semibold sm:text-2xl">{course.title}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {course.lecture_count} lectures · {course.category}
        </p>
      </div>

      {banner && (
        <div className={`rounded-xl border px-4 py-3 ${banner.tone}`}>
          <p className="text-sm font-semibold">{banner.title}</p>
          <p className="mt-0.5 text-xs opacity-90">{banner.body}</p>
          {course.admin_note && (
            <p className="mt-2 whitespace-pre-wrap rounded-md bg-background/60 px-3 py-2 text-xs">
              <span className="font-medium">Reviewer note:</span> {course.admin_note}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-4">
          <nav className="rounded-2xl border border-border bg-card p-1.5">
            {STEPS.map((s) => {
              const active = step === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStep(s.key)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <s.icon className="h-4 w-4 shrink-0" />
                  {s.label}
                </button>
              );
            })}
          </nav>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-sm font-semibold">Readiness</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {doneCount}/{items.length}
              </p>
            </div>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(doneCount / items.length) * 100}%` }}
              />
            </div>
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.key} className="flex items-start gap-2 text-xs">
                  {item.done ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className={item.done ? "text-muted-foreground" : ""}>{item.label}</span>
                </li>
              ))}
            </ul>

            {course.status === "pending" ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Submitted and waiting for review.
              </p>
            ) : isLive ? (
              <button
                type="button"
                className={`${btnOutline} mt-4 w-full`}
                disabled={pending}
                onClick={() => run(() => unpublishCourse(course.id))}
              >
                Unpublish
              </button>
            ) : (
              <button
                type="button"
                className={`${btnPrimary} mt-4 w-full`}
                disabled={!canSubmit || pending}
                onClick={() => run(() => submitCourseForReview(course.id))}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Submit for review
              </button>
            )}

            {!ready && !isLive && course.status !== "pending" && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Complete every item to submit.
              </p>
            )}
          </div>

          {/* Drafts only — the server refuses anything else. */}
          {["draft", "rejected"].includes(course.status) && course.enrollment_count === 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              {confirmDelete ? (
                <div className="space-y-2">
                  <p className="text-xs">
                    Delete this course and everything in it? This can&apos;t be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`${btnOutline} flex-1`}
                      onClick={() => setConfirmDelete(false)}
                      disabled={pending}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={`${btn} flex-1 bg-red-600 text-white hover:bg-red-700`}
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => deleteCourse(course.id),
                          () => router.push("/instructor"),
                        )
                      }
                    >
                      {pending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete this draft
                </button>
              )}
            </div>
          )}
        </aside>

        <div className="min-w-0">
          {step === "landing" && <LandingStep course={course} />}
          {step === "curriculum" && <CurriculumStep course={course} />}
          {step === "pricing" && <PricingStep course={course} />}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { createCourse } from "@/lib/actions/lms-courses";
import { LMS_CATEGORIES } from "@/lib/lms";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function NewCourseForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const result = await createCourse(formData);
      if (result.error || !result.id) {
        setError(result.error ?? "Could not create the course.");
        return;
      }
      router.push(`/instructor/courses/${result.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-medium">
          Course title
        </label>
        <input
          id="title"
          name="title"
          required
          minLength={6}
          maxLength={80}
          className={field}
          placeholder="NCLEX Pharmacology: the 200 drugs that actually appear"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          What a nurse would search for. Specific beats clever.
        </p>
      </div>

      <div>
        <label htmlFor="category" className="mb-1.5 block text-sm font-medium">
          Category
        </label>
        <select id="category" name="category" required defaultValue="" className={field}>
          <option value="" disabled>
            Choose a category
          </option>
          {LMS_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="inline-flex items-start gap-1.5 text-sm text-red-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Create course
      </button>
    </form>
  );
}

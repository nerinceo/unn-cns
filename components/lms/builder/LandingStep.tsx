"use client";

import { useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ImagePlus, Loader2, Trash2 } from "lucide-react";
import {
  updateCourseLanding,
  uploadCourseCover,
  type CourseForEdit,
} from "@/lib/actions/lms-courses";
import { settle } from "@/lib/utils/settle";
import { LMS_CATEGORIES, LMS_LEVELS, MIN_LEARNING_OUTCOMES } from "@/lib/lms";

const RichTextEditor = dynamic(
  () => import("@/components/lms/RichTextEditor").then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <div className="h-40 rounded-lg border border-border bg-muted" /> },
);

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <label className="text-sm font-medium">{children}</label>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function LandingStep({ course }: { course: CourseForEdit }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [description, setDescription] = useState(course.description ?? "");
  const [coverUrl, setCoverUrl] = useState(course.cover_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [outcomes, setOutcomes] = useState((course.what_you_learn ?? []).join("\n"));
  const fileInput = useRef<HTMLInputElement>(null);

  const outcomeCount = outcomes.split("\n").filter((s) => s.trim()).length;

  async function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    const result = await settle(uploadCourseCover(course.id, body));
    setUploading(false);
    if (result.error || !result.url) {
      setError(result.error ?? "Could not upload that image.");
      return;
    }
    setCoverUrl(result.url);
    router.refresh();
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("description", description);
    formData.set("cover_url", coverUrl);
    formData.set("what_you_learn", outcomes);

    setError(null);
    setSaved(false);
    start(async () => {
      const result = await settle(updateCourseLanding(course.id, formData));
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Course basics</h2>

        <div>
          <Label hint="What a nurse will search for. Specific beats clever.">Title</Label>
          <input
            name="title"
            defaultValue={course.title}
            maxLength={80}
            required
            className={field}
          />
        </div>

        <div>
          <Label hint="One line under the title on the marketplace card.">
            Short description
          </Label>
          <input
            name="subtitle"
            defaultValue={course.subtitle ?? ""}
            maxLength={160}
            className={field}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Category</Label>
            <select name="category" defaultValue={course.category} className={field} required>
              {LMS_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Level</Label>
            <select name="level" defaultValue={course.level} className={field}>
              {LMS_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label>Language</Label>
          <select name="language" defaultValue={course.language ?? "en"} className={field}>
            <option value="en">English</option>
            <option value="fil">Filipino</option>
            <option value="hi">Hindi</option>
            <option value="ml">Malayalam</option>
            <option value="ar">Arabic</option>
            <option value="fr">French</option>
            <option value="es">Spanish</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Cover image</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          1280×720 works best. This is what a buyer sees on the marketplace.
        </p>

        {coverUrl ? (
          <div className="space-y-3">
            <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-lg border border-border bg-muted">
              <Image src={coverUrl} alt="Course cover" fill className="object-cover" sizes="448px" />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => setCoverUrl("")}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="flex aspect-video w-full max-w-md flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted"
          >
            {uploading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm">Uploading…</span>
              </>
            ) : (
              <>
                <ImagePlus className="h-6 w-6" />
                <span className="text-sm">Upload a cover image</span>
              </>
            )}
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={pickCover}
          className="hidden"
        />
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <Label hint={`One per line. At least ${MIN_LEARNING_OUTCOMES}.`}>
            What you&apos;ll learn
          </Label>
          <textarea
            value={outcomes}
            onChange={(e) => setOutcomes(e.target.value)}
            rows={6}
            className={field}
          />
          <p
            className={`mt-1 text-xs ${
              outcomeCount >= MIN_LEARNING_OUTCOMES ? "text-emerald-600" : "text-muted-foreground"
            }`}
          >
            {outcomeCount} of {MIN_LEARNING_OUTCOMES} minimum
          </p>
        </div>

        <div>
          <Label hint="One per line.">Requirements</Label>
          <textarea
            name="requirements"
            defaultValue={(course.requirements ?? []).join("\n")}
            rows={3}
            className={field}
          />
        </div>

        <div>
          <Label hint="One per line.">Who this course is for</Label>
          <textarea
            name="who_is_for"
            defaultValue={(course.who_is_for ?? []).join("\n")}
            rows={3}
            className={field}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <Label hint="The full pitch. Structure it with headings and lists.">Description</Label>
        <RichTextEditor
          value={description}
          onChange={setDescription}
          placeholder="Describe what the course covers, how it's taught, and what a learner walks away able to do…"
          minHeight="200px"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || uploading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save landing page
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
            <Check className="h-4 w-4" />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}

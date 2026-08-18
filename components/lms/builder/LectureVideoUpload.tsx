"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  createLectureVideoUpload,
  confirmLectureVideo,
  failLectureVideo,
  deleteLecturePart,
  renameLecturePart,
  reorderLectureParts,
  type EditPart,
} from "@/lib/actions/lms-courses";
import { formatDuration } from "@/lib/lms";

/**
 * Read a video's duration without uploading it.
 *
 * With no transcoder there is no server-side probe, so the browser measures the
 * file it already holds. The number only drives display and the readiness
 * checklist — never money — so a hostile client editing it gains nothing but a
 * wrong runtime on their own course page.
 */
function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    const done = (value: number) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration) : 0);
    el.onerror = () => done(0);
    el.src = url;
  });
}

/** PUT straight to R2 with real progress. fetch() cannot report upload progress. */
function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    // An opaque XHR error here is almost always the bucket's CORS policy, not
    // the network — and it is invisible in server logs, so say so explicitly.
    xhr.onerror = () =>
      reject(new Error("Network error during upload. Check the bucket's CORS settings."));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    signal.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}

const smallBtn =
  "inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50";

/**
 * The video half of a lecture: an ordered list of parts.
 *
 * A lecture is one idea; a part is one take. Filming a demo in three passes
 * should not force the curriculum to read as three lectures and split the
 * learner's progress across them — so parts live inside the lecture and
 * autoplay in sequence.
 */
export function LectureVideoUpload({
  lectureId,
  parts,
  locked,
}: {
  lectureId: string;
  parts: EditPart[];
  locked: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;
    let createdPartId: string | null = null;

    try {
      const durationS = await readDuration(file);

      const ticket = await createLectureVideoUpload(lectureId, {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });
      // `!== null` rather than truthiness: `error` is a null literal on the
      // success branch, which is what lets TypeScript discriminate the union.
      if (ticket.error !== null) throw new Error(ticket.error);
      createdPartId = ticket.partId;

      await putWithProgress(
        ticket.uploadUrl,
        file,
        ticket.contentType,
        setProgress,
        controller.signal,
      );

      const confirmed = await confirmLectureVideo(ticket.partId, {
        key: ticket.key,
        durationS,
        bytes: file.size,
      });
      if (confirmed.error) throw new Error(confirmed.error);

      setProgress(null);
      router.refresh();
    } catch (err) {
      const message = (err as Error).message || "Upload failed.";
      setError(message);
      setProgress(null);
      // Leave the row in an honest state rather than a stuck "uploading".
      if (createdPartId) await failLectureVideo(createdPartId, message);
      router.refresh();
    } finally {
      abortRef.current = null;
    }
  }

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const result = await action();
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function move(i: number, direction: -1 | 1) {
    const ids = parts.map((p) => p.id);
    const target = i + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[i], ids[target]] = [ids[target], ids[i]];
    run(() => reorderLectureParts(lectureId, ids));
  }

  return (
    <div className="mt-2 space-y-2">
      {parts.length > 0 && (
        <ol className="space-y-1.5">
          {parts.map((p, i) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5"
            >
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                {i + 1}
              </span>

              {p.video_status === "ready" ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : p.video_status === "error" ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
              ) : (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              )}

              <input
                defaultValue={p.title ?? ""}
                placeholder={`Part ${i + 1}`}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value !== (p.title ?? "")) run(() => renameLecturePart(p.id, value));
                }}
                className="-mx-1 min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />

              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {p.duration_s > 0 ? formatDuration(p.duration_s) : "—"}
              </span>

              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  aria-label="Move video up"
                  disabled={i === 0 || pending}
                  onClick={() => move(i, -1)}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Move video down"
                  disabled={i === parts.length - 1 || pending}
                  onClick={() => move(i, 1)}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {!locked && (
                  <button
                    type="button"
                    aria-label="Remove video"
                    disabled={pending}
                    onClick={() => run(() => deleteLecturePart(p.id))}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {progress !== null ? (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Uploading… {progress}%
            </span>
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <button type="button" className={smallBtn} onClick={() => inputRef.current?.click()}>
          {parts.length === 0 ? (
            <>
              <Upload className="h-3.5 w-3.5" />
              Upload video
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" />
              Add another video
            </>
          )}
        </button>
      )}

      {parts.length === 0 && progress === null && (
        <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Video className="h-3 w-3" />
          MP4, MOV or WebM. Add several and they play through in order.
        </p>
      )}

      {(error || parts.find((p) => p.video_error)?.video_error) && (
        <p className="text-[11px] text-red-600">
          {error ?? parts.find((p) => p.video_error)?.video_error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        onChange={onPick}
        className="hidden"
      />
    </div>
  );
}

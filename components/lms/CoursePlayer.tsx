"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  FileText,
  Loader2,
  Lock,
  PanelRightClose,
  PanelRightOpen,
  PlayCircle,
  Trophy,
} from "lucide-react";
import {
  getPartPlayback,
  getResourceDownloadUrl,
  saveLectureProgress,
  setLectureComplete,
} from "@/lib/actions/lms-learn";
import { formatDuration } from "@/lib/lms";
import type { PlayerData, PlayerLecture } from "@/lib/cns/lms";

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** How often the resume point is written while a video plays. */
const PROGRESS_INTERVAL_MS = 10_000;

/** Fraction of a LECTURE watched before it counts as done. */
const AUTO_COMPLETE_AT = 0.95;

const btn =
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50";
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const btnOutline = `${btn} border border-border bg-background hover:bg-muted`;

export function CoursePlayer({
  data,
  currentLectureId,
  slug,
}: {
  data: PlayerData;
  currentLectureId: string;
  slug: string;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [marking, setMarking] = useState(false);

  const flat = useMemo(() => data.sections.flatMap((s) => s.lectures), [data.sections]);
  const index = flat.findIndex((l) => l.id === currentLectureId);
  const lecture = flat[index];
  const previous = flat
    .slice(0, Math.max(0, index))
    .reverse()
    .find((l) => !l.locked);
  const next = flat.slice(index + 1).find((l) => !l.locked);

  const href = (id: string) => `/lms/${slug}/${id}`;
  const parts = useMemo(() => lecture?.parts ?? [], [lecture]);

  /**
   * Seconds of lecture that precede a given part. Progress is stored as one
   * cumulative offset for the whole lecture, so this is what converts between
   * "12:40 into the lecture" and "part 3, 40 seconds in", in both directions.
   */
  const offsetOfPart = useCallback(
    (i: number) => parts.slice(0, i).reduce((n, p) => n + (p.duration_s ?? 0), 0),
    [parts],
  );

  /** Which part a stored resume point falls inside, and how far into it. */
  const locate = useCallback(
    (cumulative: number) => {
      let remaining = Math.max(0, cumulative);
      for (let i = 0; i < parts.length; i++) {
        const d = parts[i].duration_s ?? 0;
        if (remaining < d || i === parts.length - 1) return { partIndex: i, within: remaining };
        remaining -= d;
      }
      return { partIndex: 0, within: 0 };
    },
    [parts],
  );

  // Which part is on screen. Resets to the resume position when the lecture
  // changes — keyed on the id, never on the object, because `data` is a fresh
  // object after every router.refresh().
  const [partIndex, setPartIndex] = useState(0);
  const lectureId = lecture?.id;
  const resumeAt = lecture?.position_s ?? 0;
  const resumedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!lectureId) return;
    if (resumedFor.current === lectureId) return;
    resumedFor.current = lectureId;
    setPartIndex(locate(resumeAt).partIndex);
  }, [lectureId, resumeAt, locate]);

  const currentPart = parts[partIndex];

  const [completed, setCompleted] = useState(lecture?.completed ?? false);
  useEffect(() => setCompleted(lecture?.completed ?? false), [lecture?.id, lecture?.completed]);

  // ── Playback URL, per part ────────────────────────────────────────────────
  // Minted on demand for the part actually being watched. Pre-signing a whole
  // lecture would hand out live URLs for video the learner may never open, and
  // put them in the page source.
  const partId = currentPart?.id;
  useEffect(() => {
    if (!partId) {
      setVideoUrl(null);
      return;
    }
    let cancelled = false;
    setVideoUrl(null);
    setVideoError(null);
    setLoadingVideo(true);

    getPartPlayback(partId).then((result) => {
      if (cancelled) return;
      setLoadingVideo(false);
      if ("error" in result) setVideoError(result.error);
      else setVideoUrl(result.url);
    });

    return () => {
      cancelled = true;
    };
  }, [partId]);

  // ── Resume within the part ────────────────────────────────────────────────
  const seekedFor = useRef<string | null>(null);
  const onLoadedMetadata = useCallback(() => {
    const el = videoRef.current;
    if (!el || !currentPart) return;
    el.playbackRate = speed;

    // Seek once per part, and not into the last 15 seconds — dropping someone
    // onto the closing frames reads as broken.
    if (seekedFor.current !== currentPart.id) {
      seekedFor.current = currentPart.id;
      const { partIndex: target, within } = locate(resumeAt);
      if (target === partIndex && within > 0 && within < el.duration - 15) {
        el.currentTime = within;
      }
    }
  }, [currentPart, speed, locate, resumeAt, partIndex]);

  // ── Progress autosave ─────────────────────────────────────────────────────
  const saveNow = useCallback(() => {
    const el = videoRef.current;
    if (!el || !lecture || lecture.kind !== "video" || !data.enrolled) return;
    const at = Math.floor(offsetOfPart(partIndex) + el.currentTime);
    if (at > 0) void saveLectureProgress(lecture.id, at);
  }, [lecture, data.enrolled, offsetOfPart, partIndex]);

  useEffect(() => {
    if (!data.enrolled) return;
    const timer = setInterval(() => {
      if (!videoRef.current?.paused) saveNow();
    }, PROGRESS_INTERVAL_MS);

    // A tab hidden or closed mid-lecture must not lose the resume point.
    const onHide = () => {
      if (document.visibilityState === "hidden") saveNow();
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      saveNow();
    };
  }, [saveNow, data.enrolled]);

  const markComplete = useCallback(
    async (value: boolean) => {
      if (!lecture || !data.enrolled) return;
      setMarking(true);
      setCompleted(value);
      const result = await setLectureComplete(lecture.id, value);
      setMarking(false);
      if (result.error) setCompleted(!value);
      else router.refresh();
    },
    [lecture, data.enrolled, router],
  );

  // Auto-complete near the end of the WHOLE lecture, not of a part.
  const autoCompleted = useRef<string | null>(null);
  const onTimeUpdate = useCallback(() => {
    const el = videoRef.current;
    if (!el || !lecture || completed || autoCompleted.current === lecture.id) return;
    const total = lecture.duration_s || 0;
    if (total <= 0) return;
    const watched = offsetOfPart(partIndex) + el.currentTime;
    if (watched / total >= AUTO_COMPLETE_AT) {
      autoCompleted.current = lecture.id;
      void markComplete(true);
    }
  }, [lecture, completed, markComplete, offsetOfPart, partIndex]);

  /** End of a part: roll on to the next, else finish the lecture. */
  const onPartEnded = useCallback(() => {
    saveNow();
    if (partIndex < parts.length - 1) {
      setPartIndex((i) => i + 1);
      return;
    }
    if (!completed) void markComplete(true);
    if (next) router.push(href(next.id));
  }, [saveNow, partIndex, parts.length, completed, markComplete, next, router, slug]);

  if (!lecture) return null;

  const finished = data.progressPercent >= 100;
  const multiPart = parts.length > 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/lms"
          className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">{data.course.title}</span>
        </Link>
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Hide course content" : "Show course content"}
          className="hidden rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
        >
          {sidebarOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </button>
      </div>

      {!data.enrolled && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
          {data.isOwner
            ? "You're previewing your own course. Progress isn't recorded."
            : "This is a free preview. Buy the course on the UNN marketplace to unlock everything and track your progress."}
        </div>
      )}

      <div className={`grid gap-4 ${sidebarOpen ? "lg:grid-cols-[1fr_340px]" : "lg:grid-cols-1"}`}>
        <div className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {lecture.kind === "video" ? (
              // Light letterbox, not the conventional near-black: no black
              // backgrounds anywhere, video chrome included.
              <div className="relative aspect-video w-full bg-muted">
                {loadingVideo && (
                  <div className="absolute inset-0 grid place-items-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                {(videoError || parts.length === 0) && !loadingVideo && (
                  <div className="absolute inset-0 grid place-items-center px-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      {videoError ?? "This lecture has no video yet."}
                    </p>
                  </div>
                )}
                {videoUrl && (
                  <video
                    ref={videoRef}
                    key={videoUrl}
                    src={videoUrl}
                    controls
                    autoPlay={partIndex > 0}
                    controlsList="nodownload"
                    onContextMenu={(e) => e.preventDefault()}
                    playsInline
                    className="h-full w-full"
                    onLoadedMetadata={onLoadedMetadata}
                    onTimeUpdate={onTimeUpdate}
                    onPause={saveNow}
                    onEnded={onPartEnded}
                  />
                )}
              </div>
            ) : (
              <div className="p-6 sm:p-8">
                {lecture.content ? (
                  // Sanitized at write time by the builder, against the same
                  // allowlist HUB uses. Never render unsanitized input here.
                  //
                  // Any <img> that survived that pass points at our own media
                  // domain — see isOwnMediaUrl in lib/sanitize.ts. The explicit
                  // prose-img rules bound an instructor's full-resolution photo
                  // to the column instead of trusting a plugin default, since a
                  // 4000px wide image would otherwise decide the page width.
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert prose-img:my-4 prose-img:h-auto prose-img:max-w-full prose-img:rounded-lg prose-img:border prose-img:border-border"
                    dangerouslySetInnerHTML={{ __html: lecture.content }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This lesson doesn&apos;t have any content yet.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Parts strip — only when there is more than one, so a single-video
              lecture keeps the simpler chrome it had before. */}
          {multiPart && (
            <div className="mt-3 rounded-2xl border border-border bg-card p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Part {partIndex + 1} of {parts.length} · plays through automatically
              </p>
              <ol className="flex flex-wrap gap-2">
                {parts.map((p, i) => {
                  const active = i === partIndex;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setPartIndex(i)}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          active
                            ? "border-primary bg-primary/10 font-medium text-primary"
                            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {p.title?.trim() || `Part ${i + 1}`}
                        {p.duration_s > 0 && (
                          <span className="ml-1.5 tabular-nums opacity-70">
                            {formatDuration(p.duration_s)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          <div className="mt-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-base font-semibold">{lecture.title}</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {data.instructorName}
                  {lecture.duration_s > 0 ? ` · ${formatDuration(lecture.duration_s)}` : ""}
                  {multiPart ? ` · ${parts.length} videos` : ""}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {lecture.kind === "video" && videoUrl && (
                  <select
                    value={speed}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setSpeed(value);
                      if (videoRef.current) videoRef.current.playbackRate = value;
                    }}
                    aria-label="Playback speed"
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                  >
                    {SPEEDS.map((s) => (
                      <option key={s} value={s}>
                        {s}×
                      </option>
                    ))}
                  </select>
                )}

                {data.enrolled && (
                  <button
                    type="button"
                    className={completed ? btnOutline : btnPrimary}
                    disabled={marking}
                    onClick={() => markComplete(!completed)}
                  >
                    {marking ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    {completed ? "Completed" : "Mark complete"}
                  </button>
                )}
              </div>
            </div>

            {lecture.resources.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium">Resources</p>
                <ul className="space-y-1.5">
                  {lecture.resources.map((r) => (
                    <li key={r.id}>
                      <ResourceLink id={r.id} name={r.file_name} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
              {previous ? (
                <Link href={href(previous.id)} className={btnOutline}>
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={href(next.id)} className={btnPrimary}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">Last lecture</span>
              )}
            </div>
          </div>

          {finished && (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              <Trophy className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-900">Course complete</p>
              <p className="mt-1 text-xs text-emerald-800">
                Nicely done. Everything stays available if you want to revisit it.
              </p>
            </div>
          )}
        </div>

        {sidebarOpen && (
          <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-sm font-semibold">Course content</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {data.progressPercent}%
                  </p>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${data.progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="divide-y divide-border">
                {data.sections.map((section, sectionIndex) => {
                  const done = section.lectures.filter((l) => l.completed).length;
                  return (
                    <div key={section.id}>
                      <div className="bg-muted/30 px-4 py-2.5">
                        <p className="text-xs font-medium">
                          {sectionIndex + 1}. {section.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {done}/{section.lectures.length} complete
                        </p>
                      </div>
                      <ul>
                        {section.lectures.map((l) => (
                          <CurriculumRow
                            key={l.id}
                            lecture={l}
                            active={l.id === lecture.id}
                            href={href(l.id)}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function CurriculumRow({
  lecture,
  active,
  href,
}: {
  lecture: PlayerLecture;
  active: boolean;
  href: string;
}) {
  const Icon = lecture.kind === "article" ? FileText : PlayCircle;
  const partCount = lecture.parts.length;

  const body = (
    <div
      className={`flex items-start gap-2.5 px-4 py-2.5 text-sm transition-colors ${
        active ? "bg-primary/10" : "hover:bg-muted"
      }`}
    >
      {lecture.locked ? (
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      ) : lecture.completed ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${active ? "font-medium text-primary" : ""}`}>
          {lecture.title}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon className="h-3 w-3" />
          {lecture.duration_s > 0 ? formatDuration(lecture.duration_s) : lecture.kind}
          {partCount > 1 && <span>· {partCount} videos</span>}
          {lecture.is_preview && <span className="font-medium text-primary">Preview</span>}
        </span>
      </span>
    </div>
  );

  return (
    <li>
      {lecture.locked ? (
        <div className="opacity-60">{body}</div>
      ) : (
        <Link href={href}>{body}</Link>
      )}
    </li>
  );
}

/**
 * Downloads mint their presigned URL on click, not on render — a resource list
 * rendered into HTML with live URLs would leak paid files to anyone who views
 * source on a preview lecture.
 */
function ResourceLink({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await getResourceDownloadUrl(id);
          setBusy(false);
          if ("error" in result) setError(result.error);
          else window.location.href = result.url;
        }}
        className="inline-flex items-center gap-1.5 text-xs text-primary transition-colors hover:opacity-80"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {name}
      </button>
      {error && <p className="mt-0.5 text-[11px] text-red-600">{error}</p>}
    </>
  );
}

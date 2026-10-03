"use client";

import { useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  GripVertical,
  Loader2,
  Paperclip,
  Plus,
  PlayCircle,
  Trash2,
  X,
} from "lucide-react";
import { LectureVideoUpload } from "./LectureVideoUpload";
import {
  addSection,
  renameSection,
  deleteSection,
  reorderSections,
  addLecture,
  updateLecture,
  deleteLecture,
  reorderLectures,
  addLectureResource,
  deleteLectureResource,
  type CourseForEdit,
} from "@/lib/actions/lms-courses";
import { settle } from "@/lib/utils/settle";
import { formatDuration } from "@/lib/lms";

const RichTextEditor = dynamic(
  () => import("@/components/lms/RichTextEditor").then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <div className="h-32 rounded-lg border border-border bg-muted" /> },
);

type Section = CourseForEdit["sections"][number];
type Lecture = Section["lectures"][number];

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";
const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const btnOutline = `${btn} border border-border bg-background hover:bg-muted`;

function bytesLabel(n: number | null | undefined): string {
  if (!n) return "";
  const mb = n / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

// ── Article body ────────────────────────────────────────────────────────────

function ArticleEditor({ lecture }: { lecture: Lecture }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState(lecture.content ?? "");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  if (!open) {
    return (
      <button type="button" className={`${btnOutline} mt-2`} onClick={() => setOpen(true)}>
        {lecture.content ? "Edit article" : "Write article"}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <RichTextEditor
        value={html}
        onChange={setHtml}
        placeholder="Write the lesson…"
        minHeight="160px"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await updateLecture(lecture.id, { content: html });
              setSaved(true);
              router.refresh();
              setTimeout(() => setSaved(false), 2000);
            })
          }
        >
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          Save
        </button>
        <button type="button" className={btnOutline} onClick={() => setOpen(false)}>
          Close
        </button>
        {saved && <span className="text-xs text-emerald-600">Saved</span>}
      </div>
    </div>
  );
}

// ── Resources ───────────────────────────────────────────────────────────────

function Resources({ lecture, onError }: { lecture: Lecture; onError: (m: string) => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    // Resources go through the server, not a presigned browser PUT: they are
    // small, and the server path needs no bucket CORS.
    const body = new FormData();
    body.set("file", file);
    const result = await settle(addLectureResource(lecture.id, body));
    setBusy(false);
    if (result.error) onError(result.error);
    else router.refresh();
  }

  return (
    <div className="mt-2">
      {lecture.resources.length > 0 && (
        <ul className="mb-2 space-y-1">
          {lecture.resources.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2.5 py-1.5"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-xs">
                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{r.file_name}</span>
                <span className="shrink-0 text-muted-foreground">{bytesLabel(r.file_size)}</span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${r.file_name}`}
                onClick={async () => {
                  await deleteLectureResource(r.id);
                  router.refresh();
                }}
                className="shrink-0 text-muted-foreground transition-colors hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Add resource
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        onChange={onPick}
        className="hidden"
      />
    </div>
  );
}

// ── Lecture row ─────────────────────────────────────────────────────────────

function LectureRow({
  lecture,
  locked,
  onError,
  onMove,
  canMoveUp,
  canMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  lecture: Lecture;
  locked: boolean;
  onError: (m: string) => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(lecture.title);
  const [pending, start] = useTransition();

  const Icon = lecture.kind === "article" ? FileText : PlayCircle;

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="rounded-lg border border-border bg-background p-3"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-2 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
        <Icon className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />

        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== lecture.title) {
                start(async () => {
                  const result = await settle(updateLecture(lecture.id, { title }));
                  if (result.error) onError(result.error);
                  router.refresh();
                });
              }
            }}
            className="-mx-1 w-full rounded bg-transparent px-1 py-0.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
          />

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs capitalize text-muted-foreground">{lecture.kind}</span>
            {lecture.duration_s > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatDuration(lecture.duration_s)}
              </span>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={lecture.is_preview}
                onChange={(e) =>
                  start(async () => {
                    await updateLecture(lecture.id, { is_preview: e.target.checked });
                    router.refresh();
                  })
                }
                className="rounded border-border text-primary focus:ring-primary/30"
              />
              Free preview
            </label>
            {pending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>

          {lecture.kind === "video" ? (
            <LectureVideoUpload lectureId={lecture.id} parts={lecture.parts} locked={locked} />
          ) : (
            <ArticleEditor lecture={lecture} />
          )}

          <Resources lecture={lecture} onError={onError} />
        </div>

        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            aria-label="Move lecture up"
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Move lecture down"
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {!locked && (
            <button
              type="button"
              aria-label="Delete lecture"
              onClick={async () => {
                const result = await settle(deleteLecture(lecture.id));
                if (result.error) onError(result.error);
                router.refresh();
              }}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// ── Curriculum ──────────────────────────────────────────────────────────────

export function CurriculumStep({ course }: { course: CourseForEdit }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [newSection, setNewSection] = useState("");
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newLecture, setNewLecture] = useState("");
  const [newKind, setNewKind] = useState<"video" | "article">("video");
  const [pending, start] = useTransition();
  const dragged = useRef<{ id: string; sectionId: string } | null>(null);

  // Enrolled learners have paid for this curriculum, so destructive edits are
  // withheld rather than left to fail server-side with a confusing message.
  const locked = course.enrollment_count > 0;

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const result = await settle(action());
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  /**
   * Rebuild the whole course's lecture order from a proposed arrangement and
   * send it in one call. Sending the complete order (rather than a delta) means
   * a partially applied update still leaves a consistent curriculum.
   */
  function commitOrder(sections: { id: string; lectures: Lecture[] }[]) {
    const moves: { id: string; sectionId: string; position: number }[] = [];
    let position = 0;
    for (const section of sections) {
      for (const lecture of section.lectures) {
        moves.push({ id: lecture.id, sectionId: section.id, position: position++ });
      }
    }
    run(() => reorderLectures(course.id, moves));
  }

  function moveLecture(sectionIndex: number, lectureIndex: number, direction: -1 | 1) {
    const next = course.sections.map((s) => ({ id: s.id, lectures: [...s.lectures] }));
    const list = next[sectionIndex].lectures;
    const target = lectureIndex + direction;
    if (target < 0 || target >= list.length) return;
    [list[lectureIndex], list[target]] = [list[target], list[lectureIndex]];
    commitOrder(next);
  }

  function dropOn(targetSectionId: string, targetLectureId: string | null) {
    const source = dragged.current;
    dragged.current = null;
    if (!source || source.id === targetLectureId) return;

    const next = course.sections.map((s) => ({ id: s.id, lectures: [...s.lectures] }));

    let moving: Lecture | undefined;
    for (const section of next) {
      const index = section.lectures.findIndex((l) => l.id === source.id);
      if (index >= 0) {
        moving = section.lectures.splice(index, 1)[0];
        break;
      }
    }
    if (!moving) return;

    const destination = next.find((s) => s.id === targetSectionId);
    if (!destination) return;

    const at = targetLectureId
      ? destination.lectures.findIndex((l) => l.id === targetLectureId)
      : destination.lectures.length;
    destination.lectures.splice(at < 0 ? destination.lectures.length : at, 0, moving);

    commitOrder(next);
  }

  function moveSection(index: number, direction: -1 | 1) {
    const ids = course.sections.map((s) => s.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderSections(course.id, ids));
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {locked && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-800">
            {course.enrollment_count} learner{course.enrollment_count === 1 ? " is" : "s are"}{" "}
            enrolled. You can add and edit content, but deleting is disabled — unpublish the
            course first if you need to restructure it.
          </p>
        </div>
      )}

      {course.sections.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="mb-1 text-sm font-medium">No modules yet</p>
          <p className="text-xs text-muted-foreground">
            Start with one module — say &ldquo;Getting started&rdquo; — then add lectures to it.
          </p>
        </div>
      )}

      {course.sections.map((section, sectionIndex) => (
        <div key={section.id} className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-3">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              Module {sectionIndex + 1}
            </span>
            <input
              defaultValue={section.title}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== section.title) run(() => renameSection(section.id, value));
              }}
              className="-mx-1 min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                aria-label="Move module up"
                disabled={sectionIndex === 0}
                onClick={() => moveSection(sectionIndex, -1)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Move module down"
                disabled={sectionIndex === course.sections.length - 1}
                onClick={() => moveSection(sectionIndex, 1)}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              {!locked && (
                <button
                  type="button"
                  aria-label="Delete module"
                  onClick={() => run(() => deleteSection(section.id))}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div
            className="space-y-2 p-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dropOn(section.id, null)}
          >
            {section.lectures.length === 0 && (
              <p className="px-1 py-3 text-xs text-muted-foreground">
                No lectures in this module yet.
              </p>
            )}

            <ul className="space-y-2">
              {section.lectures.map((lecture, lectureIndex) => (
                <LectureRow
                  key={lecture.id}
                  lecture={lecture}
                  locked={locked}
                  onError={setError}
                  canMoveUp={lectureIndex > 0}
                  canMoveDown={lectureIndex < section.lectures.length - 1}
                  onMove={(d) => moveLecture(sectionIndex, lectureIndex, d)}
                  onDragStart={() => {
                    dragged.current = { id: lecture.id, sectionId: section.id };
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOn(section.id, lecture.id)}
                />
              ))}
            </ul>

            {addingTo === section.id ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <input
                  autoFocus
                  value={newLecture}
                  onChange={(e) => setNewLecture(e.target.value)}
                  placeholder="Lecture title"
                  className={field}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setAddingTo(null);
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as "video" | "article")}
                    className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                  >
                    <option value="video">Video</option>
                    <option value="article">Article</option>
                  </select>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={!newLecture.trim() || pending}
                    onClick={() =>
                      run(async () => {
                        const result = await addLecture(section.id, newKind, newLecture);
                        if (!result.error) {
                          setNewLecture("");
                          setAddingTo(null);
                        }
                        return result;
                      })
                    }
                  >
                    {pending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Add
                  </button>
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={() => setAddingTo(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAddingTo(section.id);
                  setNewLecture("");
                }}
                className="inline-flex items-center gap-1.5 px-1 text-sm text-primary transition-opacity hover:opacity-80"
              >
                <Plus className="h-4 w-4" />
                Add lecture
              </button>
            )}
          </div>
        </div>
      ))}

      <div className="rounded-2xl border border-dashed border-border bg-card p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            placeholder="New module title, e.g. Cardiac drugs"
            className={field}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSection.trim()) {
                e.preventDefault();
                run(async () => {
                  const result = await addSection(course.id, newSection);
                  if (!result.error) setNewSection("");
                  return result;
                });
              }
            }}
          />
          <button
            type="button"
            className={`${btnPrimary} shrink-0 px-4 py-2 text-sm`}
            disabled={!newSection.trim() || pending}
            onClick={() =>
              run(async () => {
                const result = await addSection(course.id, newSection);
                if (!result.error) setNewSection("");
                return result;
              })
            }
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add module
          </button>
        </div>
      </div>
    </div>
  );
}

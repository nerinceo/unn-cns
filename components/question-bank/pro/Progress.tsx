"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, CheckCircle2, Circle, PlayCircle } from "lucide-react";

/**
 * Question Bank Pro — Save, and picking up where you left off.
 *
 * Save is kept on the member's account (not this browser), so the saved list
 * follows them to any device. Read marks and a progress bar exist on Previous
 * Years only (Naveen, 2026-10-15); everywhere else stays free of progress.
 */

type Kind = "q" | "mnemonic" | "note" | "sos";

/** Save / Saved, and on Previous Years Mark as read. Optimistic; a refused change rolls back with the reason. */
export function MarkButtons({
  kind,
  item,
  saved: saved0 = false,
  read: read0,
  compact = false,
}: {
  kind: Kind;
  item: number;
  saved?: boolean;
  /** Given only where reading is tracked (Previous Years). */
  read?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(saved0);
  const [read, setRead] = useState(read0 ?? false);
  const [error, setError] = useState<string | null>(null);

  const send = async (args: Record<string, unknown>) => {
    const res = await fetch("/api/qbank-pro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fn: "qb2_mark", args: { p_kind: kind, p_item: item, ...args } }),
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { message?: string } | null)?.message || "Not saved");
  };

  const toggle = async () => {
    const next = !saved;
    setSaved(next);
    setError(null);
    try {
      await send({ p_saved: next });
    } catch (e) {
      setSaved(!next);
      setError((e as Error).message);
    }
  };

  // Reading changes the page's progress bar and read/unread counts: refresh them.
  const toggleRead = async () => {
    const next = !read;
    setRead(next);
    setError(null);
    try {
      await send({ p_read: next });
      router.refresh();
    } catch (e) {
      setRead(!next);
      setError((e as Error).message);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-pressed={saved}
        className={`inline-flex ${compact ? "h-8 px-2.5 text-[12.5px]" : "h-9 px-3 text-[13px]"} items-center gap-1.5 rounded-lg border font-semibold transition-colors ${
          saved ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-slate-700 hover:border-primary hover:text-primary dark:text-slate-300"
        }`}
      >
        {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        {saved ? "Saved" : "Save"}
      </button>
      {read0 !== undefined && (
        <button
          type="button"
          onClick={() => void toggleRead()}
          aria-pressed={read}
          className={`inline-flex ${compact ? "h-8 px-2.5 text-[12.5px]" : "h-9 px-3 text-[13px]"} items-center gap-1.5 rounded-lg border font-semibold transition-colors ${
            read ? "border-success/40 bg-success-soft text-success" : "border-border bg-card text-slate-700 hover:border-success hover:text-success dark:text-slate-300"
          }`}
        >
          {read ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
          {read ? "Read" : "Mark as read"}
        </button>
      )}
      {error && <span className="text-[12.5px] font-medium text-danger">{error}</span>}
    </span>
  );
}

/** Previous Years only: how much of this subject the member has read. No total, just the share. */
export function ReadProgress({ read, total }: { read: number; total: number }) {
  const pct = total > 0 ? Math.round((read / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-[14px]">
        <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" /> Your reading progress
        </span>
        <span className="font-semibold tabular-nums text-slate-600 dark:text-slate-300">
          {read > 0 && pct === 0 ? "<1" : pct}% · {read.toLocaleString("en-IN")} read
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Reading progress">
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** "Continue where you left off" — reopens the exact page the member was last on. */
/** savedHref is left out for members who own nothing yet: samples have no Save. */
export function ContinueCard({ href, label, when, savedHref }: { href: string; label: string; when: string; savedHref?: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <PlayCircle className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-bold uppercase tracking-wide text-primary">Continue where you left off</p>
          <p className="truncate text-[15.5px] font-bold text-foreground">{label}</p>
          <p className="text-[13px] text-muted-foreground">{when}</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {savedHref && (
          <Link href={savedHref} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-[14px] font-semibold text-slate-700 hover:border-primary hover:text-primary dark:text-slate-300">
            <Bookmark className="h-4 w-4" /> Saved
          </Link>
        )}
        <Link href={href} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-[14px] font-semibold text-primary-foreground hover:opacity-90">
          Continue
        </Link>
      </div>
    </div>
  );
}

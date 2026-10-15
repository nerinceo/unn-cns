"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, CheckCircle2, Circle, PlayCircle } from "lucide-react";

/**
 * Question Bank Pro progress (Naveen, 2026-10-15): Save and Mark done on
 * every question and hacks card, kept on the member's account (not this
 * browser) so progress follows them; bars of done / total; and a way back to
 * where they left off.
 */

type Kind = "q" | "mnemonic" | "note" | "sos";

/** Save + Mark done. Optimistic; a refused change rolls back with the reason. */
export function MarkButtons({
  kind,
  item,
  saved: saved0 = false,
  done: done0 = false,
  compact = false,
}: {
  kind: Kind;
  item: number;
  saved?: boolean;
  done?: boolean;
  compact?: boolean;
}) {
  const [saved, setSaved] = useState(saved0);
  const [done, setDone] = useState(done0);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (which: "saved" | "done") => {
    const next = which === "saved" ? !saved : !done;
    (which === "saved" ? setSaved : setDone)(next);
    setError(null);
    try {
      const res = await fetch("/api/qbank-pro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fn: "qb2_mark", args: { p_kind: kind, p_item: item, [which === "saved" ? "p_saved" : "p_done"]: next } }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { message?: string } | null)?.message || "Not saved");
    } catch (e) {
      (which === "saved" ? setSaved : setDone)(!next);
      setError((e as Error).message);
    }
  };

  const cls = (on: boolean, tone: "brand" | "success") =>
    `inline-flex ${compact ? "h-8 px-2.5 text-[12.5px]" : "h-9 px-3 text-[13px]"} items-center gap-1.5 rounded-lg border font-semibold transition-colors ${
      on
        ? tone === "success"
          ? "border-success bg-success-soft text-success"
          : "border-primary bg-primary/5 text-primary"
        : "border-border bg-card text-slate-700 hover:border-primary hover:text-primary dark:text-slate-300"
    }`;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void toggle("saved")} aria-pressed={saved} className={cls(saved, "brand")}>
        {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        {saved ? "Saved" : "Save"}
      </button>
      <button type="button" onClick={() => void toggle("done")} aria-pressed={done} className={cls(done, "success")}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
        {done ? "Done" : "Mark as done"}
      </button>
      {error && <span className="text-[12.5px] font-medium text-danger">{error}</span>}
    </span>
  );
}

/** done / total as a bar with its numbers. */
export function ProgressBar({ done, total, label, size = "md" }: { done: number; total: number; label?: string; size?: "sm" | "md" }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className={`flex items-center justify-between gap-2 font-semibold tabular-nums ${size === "sm" ? "text-[12px]" : "text-[13px]"}`}>
        <span className="text-slate-600 dark:text-slate-400">{label ?? "Progress"}</span>
        <span className={done > 0 ? "text-success" : "text-muted-foreground"}>
          {done.toLocaleString("en-IN")} / {total.toLocaleString("en-IN")} · {pct}%
        </span>
      </div>
      <div className={`mt-1 overflow-hidden rounded-full bg-muted ${size === "sm" ? "h-1.5" : "h-2"}`} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** "Continue where you left off" — reopens the exact page the member was last on. */
export function ContinueCard({ href, label, when, savedHref }: { href: string; label: string; when: string; savedHref: string }) {
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
        <Link href={savedHref} className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-[14px] font-semibold text-slate-700 hover:border-primary hover:text-primary dark:text-slate-300">
          Saved &amp; done
        </Link>
        <Link href={href} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-[14px] font-semibold text-primary-foreground hover:opacity-90">
          Continue
        </Link>
      </div>
    </div>
  );
}

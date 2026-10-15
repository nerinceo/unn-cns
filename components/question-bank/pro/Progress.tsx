"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, PlayCircle } from "lucide-react";

/**
 * Question Bank Pro — Save, and picking up where you left off.
 *
 * Save is kept on the member's account (not this browser), so the saved list
 * follows them to any device. There is deliberately no done-tracking or
 * progress percentage (Naveen, 2026-10-15: students would feel overwhelmed).
 */

type Kind = "q" | "mnemonic" | "note" | "sos";

/** Save / Saved. Optimistic; a refused change rolls back with the reason. */
export function MarkButtons({
  kind,
  item,
  saved: saved0 = false,
  compact = false,
}: {
  kind: Kind;
  item: number;
  saved?: boolean;
  compact?: boolean;
}) {
  const [saved, setSaved] = useState(saved0);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !saved;
    setSaved(next);
    setError(null);
    try {
      const res = await fetch("/api/qbank-pro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fn: "qb2_mark", args: { p_kind: kind, p_item: item, p_saved: next } }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { message?: string } | null)?.message || "Not saved");
    } catch (e) {
      setSaved(!next);
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
      {error && <span className="text-[12.5px] font-medium text-danger">{error}</span>}
    </span>
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
        <Link href={savedHref} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-[14px] font-semibold text-slate-700 hover:border-primary hover:text-primary dark:text-slate-300">
          <Bookmark className="h-4 w-4" /> Saved
        </Link>
        <Link href={href} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-[14px] font-semibold text-primary-foreground hover:opacity-90">
          Continue
        </Link>
      </div>
    </div>
  );
}

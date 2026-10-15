"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, CheckCircle2, Circle } from "lucide-react";

/**
 * Save / Mark done on an Exam SOS card — kept in this browser, as on the
 * source page (same storage keys, so nothing a student saved there is lost on
 * a device that used both).
 */
const KEYS = { saved: "nerusalem_sos_saved_v1", done: "nerusalem_sos_done_v1" } as const;

function read(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]") as string[]);
  } catch {
    return new Set();
  }
}
function write(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {}
}

export function SosActions({ id }: { id: string }) {
  const [saved, setSaved] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    setSaved(read(KEYS.saved).has(id));
    setDone(read(KEYS.done).has(id));
  }, [id]);
  const toggle = (which: "saved" | "done") => {
    const set = read(KEYS[which]);
    const on = !set.has(id);
    if (on) set.add(id);
    else set.delete(id);
    write(KEYS[which], set);
    (which === "saved" ? setSaved : setDone)(on);
  };
  const cls = (on: boolean) =>
    `inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors ${
      on ? "border-primary bg-primary/5 text-primary" : "border-border text-slate-700 hover:border-primary hover:text-primary dark:text-slate-300"
    }`;
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => toggle("saved")} aria-pressed={saved} className={cls(saved)}>
        {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        {saved ? "Saved" : "Save"}
      </button>
      <button type="button" onClick={() => toggle("done")} aria-pressed={done} className={cls(done)}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
        {done ? "Done" : "Mark done"}
      </button>
    </div>
  );
}

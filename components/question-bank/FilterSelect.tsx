"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Hash, Layers, ListTree, Tags } from "lucide-react";

/**
 * Icons are resolved here, not passed in. A Lucide icon is a function
 * component, and a Server Component cannot serialize one across the boundary
 * into a Client Component — it fails at render, not at typecheck.
 */
const ICONS = { subject: Layers, type: Tags, marks: Hash, topic: ListTree } as const;

export type FilterOption = {
  /** Exact visible label. Never reworded — these come from the copy module. */
  label: string;
  href: string;
  count?: number;
  active: boolean;
};

/**
 * Filter dropdown for the Nursing Bank list.
 *
 * A rail of every subject and every type was eleven chips wrapping over three
 * rows before a reader reached the first question. This collapses each filter
 * to one control that opens on demand.
 *
 * Options are links, not state: the filters live in the query string so a
 * filtered list stays shareable and the back button works. That also means the
 * whole thing still functions with the panel closed — this component adds
 * disclosure, not behaviour.
 */
export function FilterSelect({
  variant,
  allLabel,
  allHref,
  options,
  widthClass = "w-72",
  noun,
}: {
  variant: keyof typeof ICONS;
  /** The "show everything" option, e.g. "All Subjects". */
  allLabel: string;
  allHref: string;
  options: FilterOption[];
  widthClass?: string;
  /**
   * Multi-select (2026-10-13): each option's href toggles it, several can be
   * active, and the button reads "3 subjects". The panel stays open while
   * picking — a click is a navigation that keeps this component mounted.
   */
  noun?: string;
}) {
  const Icon = ICONS[variant];
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = options.filter((o) => o.active);
  const isFiltered = active.length > 0;
  const buttonLabel =
    active.length === 0 ? allLabel : active.length === 1 || !noun ? active[0].label : `${active.length} ${noun}`;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex h-11 w-full items-center gap-2 rounded-xl border px-3.5 text-left text-[14px] font-semibold transition-colors sm:w-auto sm:min-w-[15rem] ${
          isFiltered
            ? "border-primary bg-primary/5 text-primary"
            : "border-border bg-card text-slate-700 hover:border-primary/60 dark:text-slate-300"
        }`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${isFiltered ? "text-primary" : "text-slate-500 dark:text-slate-400"}`} />
        <span className="min-w-0 flex-1 truncate">{buttonLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable={noun ? true : undefined}
          className={`absolute left-0 z-30 mt-2 max-h-80 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-1.5 shadow-[0_12px_32px_rgba(16,24,40,0.14)] ${widthClass}`}
        >
          <Row href={allHref} label={allLabel} active={!isFiltered} />
          <div className="my-1.5 h-px bg-border" />
          {options.map((o) => (
            <Row key={o.href} href={o.href} label={o.label} count={o.count} active={o.active} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      role="option"
      aria-selected={active}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] transition-colors ${
        active
          ? "bg-primary/10 font-semibold text-primary"
          : "text-slate-700 hover:bg-muted dark:text-slate-300"
      }`}
    >
      <Check className={`h-3.5 w-3.5 shrink-0 ${active ? "opacity-100" : "opacity-0"}`} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && (
        <span className="shrink-0 tabular-nums text-[13px] text-slate-500 dark:text-slate-400">
          {count}
        </span>
      )}
    </Link>
  );
}

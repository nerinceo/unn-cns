import {
  BookOpenCheck,
  ClipboardList,
  ListChecks,
  PenTool,
  Shapes,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

/**
 * Type families for Nursing Bank questions.
 *
 * The list interleaves every question type, so colour is what lets a reader
 * sort by question shape while scrolling instead of reading each label. Badge
 * and left rail share a family so they read as one signal, and the full-page
 * view reuses the same mapping so a question looks the same in both places.
 *
 * Deliberately NOT inside the card component: that file is "use client", and
 * the detail page is a server component. Icons render fine on the server —
 * what fails is passing one across the RSC boundary as a prop.
 */
type Tone = { icon: LucideIcon; badge: string; rail: string };

const FAMILIES: { match: readonly string[]; tone: Tone }[] = [
  {
    match: ["mcq"],
    tone: {
      icon: ListChecks,
      badge: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/25",
      rail: "bg-blue-500",
    },
  },
  {
    match: ["essay", "answer", "difference"],
    tone: {
      icon: PenTool,
      badge: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/25",
      rail: "bg-indigo-500",
    },
  },
  {
    match: ["viva", "practical", "procedure"],
    tone: {
      icon: Stethoscope,
      badge: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25",
      rail: "bg-amber-500",
    },
  },
  {
    match: ["scenario", "case", "study"],
    tone: {
      icon: ClipboardList,
      badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25",
      rail: "bg-emerald-500",
    },
  },
  {
    match: ["diagram", "flowchart", "chart"],
    tone: {
      icon: Shapes,
      badge: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25",
      rail: "bg-rose-500",
    },
  },
  {
    match: ["care plan", "drug", "health education"],
    tone: {
      icon: BookOpenCheck,
      badge: "bg-cyan-50 text-cyan-800 ring-cyan-600/20 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/25",
      rail: "bg-cyan-500",
    },
  },
];

const NEUTRAL: Tone = {
  icon: ClipboardList,
  badge: "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/25",
  rail: "bg-slate-400",
};

export function questionTone(type: string | null): Tone {
  const t = (type ?? "").toLowerCase();
  return FAMILIES.find((f) => f.match.some((m) => t.includes(m)))?.tone ?? NEUTRAL;
}

import Link from "next/link";
import { ChevronLeft, ChevronRight, Info, Lock, Search, Sparkles } from "lucide-react";
import { DISCLAIMER, bankFooter } from "@/lib/cns/question-bank-content";

/**
 * Question Bank Pro page furniture, in the RGUHS bank's design language
 * (app/(member)/question-bank/[institution]/[course]/[semester]/page.tsx):
 * the back link, the gradient header card, the free-sample notice, the
 * search box, numbered pages and the disclaimer footer.
 */

export const PRO_NAME = "RGUHS B.Sc Nursing Question Bank Pro";

export function ProBack({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
      <ChevronLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function ProHeader({
  eyebrow,
  title,
  subtitle,
  icon,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="overflow-hidden rounded-2xl border border-border bg-card">
      <span aria-hidden className="block h-1.5 w-full bg-primary" />
      {/* Phones: a compact header so the first question shows on the first screen. */}
      <div className="bg-gradient-to-br from-primary/[0.07] via-card to-card p-4 sm:p-8">
        <div className="flex items-start gap-3 sm:gap-4">
          {icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:h-12 sm:w-12">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="text-[12px] font-bold uppercase tracking-wider text-primary sm:text-[13px]">{eyebrow}</p>}
            <h1 className="mt-0.5 text-xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          </div>
        </div>
        {subtitle && <p className="mt-2 max-w-3xl text-[14px] leading-snug text-slate-600 sm:mt-3 sm:text-[16px] sm:leading-relaxed dark:text-slate-400">{subtitle}</p>}
        {children}
      </div>
    </header>
  );
}

export function ProSampleNotice({
  semester,
  shown,
  noun,
  buyUrl,
}: {
  semester: number | null;
  shown: number;
  noun: string;
  buyUrl: string | null;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-primary/30 bg-primary/[0.05] p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground sm:flex">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[14px] font-bold text-foreground sm:text-[15px]">
            Free sample · {shown} {noun}{semester ? ` in Semester ${semester}` : ""}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground sm:text-[14px]">
            {semester ? "Buy this semester or the whole bank" : "Buy any semester or the whole bank"} to open everything, with filters and search.
          </p>
        </div>
      </div>
      {buyUrl && (
        <a
          href={buyUrl}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13.5px] font-semibold text-primary-foreground hover:bg-primary/90 sm:py-2.5 sm:text-sm"
        >
          <Lock className="h-4 w-4" /> {semester ? `Buy Semester ${semester} or the whole bank` : "Buy access"}
        </a>
      )}
    </div>
  );
}

/** GET search that keeps the other filters. */
export function ProSearch({
  action,
  keep,
  value,
  placeholder,
}: {
  action: string;
  keep: Record<string, string | undefined>;
  value?: string;
  placeholder: string;
}) {
  return (
    <form action={action} method="get" className="relative min-w-0 flex-1">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input
        type="text"
        name="q"
        defaultValue={value ?? ""}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-border bg-background pl-4 pr-12 text-sm text-foreground outline-none transition-shadow placeholder:text-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/15 dark:placeholder:text-slate-400"
      />
      <button
        type="submit"
        aria-label={placeholder}
        className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90"
      >
        <Search className="h-4 w-4" />
      </button>
    </form>
  );
}

/**
 * Numbered pages. Every page is a link (server-rendered, shareable, back-button
 * correct); the window shows first, last and the pages around the current one.
 */
export function ProPager({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  const list: (number | "…")[] = [1];
  let from = Math.max(2, page - 1);
  let to = Math.min(pages - 1, page + 1);
  if (page <= 3) to = Math.min(pages - 1, 4);
  if (page >= pages - 2) from = Math.max(2, pages - 3);
  if (from > 2) list.push("…");
  for (let i = from; i <= to; i++) list.push(i);
  if (to < pages - 1) list.push("…");
  list.push(pages);

  const cell = "inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-3 text-[14px] font-semibold tabular-nums";
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={`${cell} gap-1 border border-border text-slate-700 hover:border-primary hover:text-primary dark:text-slate-300`}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </Link>
      ) : (
        <span className={`${cell} gap-1 border border-border text-slate-400`} aria-disabled>
          <ChevronLeft className="h-4 w-4" /> Previous
        </span>
      )}
      {list.map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} aria-hidden className="px-1 text-slate-400">
            …
          </span>
        ) : n === page ? (
          <span key={n} aria-current="page" className={`${cell} bg-primary text-primary-foreground`}>
            {n}
          </span>
        ) : (
          <Link key={n} href={href(n)} aria-label={`Page ${n}`} className={`${cell} border border-border text-slate-700 hover:border-primary hover:text-primary dark:text-slate-300`}>
            {n}
          </Link>
        ),
      )}
      {page < pages ? (
        <Link href={href(page + 1)} className={`${cell} gap-1 bg-primary text-primary-foreground hover:opacity-90`}>
          Next <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span className={`${cell} gap-1 border border-border text-slate-400`} aria-disabled>
          Next <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}

export function ProFooter() {
  return (
    <>
      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/25 dark:bg-amber-500/10">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <p className="text-[13.5px] leading-relaxed text-amber-900 dark:text-amber-200/90">
          <strong className="font-bold">{DISCLAIMER.label}</strong> {DISCLAIMER.body} Not an official RGUHS or INC publication.
        </p>
      </div>
      <p className="pb-2 text-center text-[13px] font-medium text-slate-500 dark:text-slate-400">{bankFooter(PRO_NAME)}</p>
    </>
  );
}

/** Builds query-string links that keep the current filters. */
export function linkBuilder(base: string, current: Record<string, string | undefined>) {
  return (patch: Record<string, string | number | undefined>) => {
    const next: Record<string, string | number | undefined> = { ...current, page: undefined, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v !== undefined && v !== "" && !(k === "page" && Number(v) <= 1)) p.set(k, String(v));
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
}

/** One value from searchParams. */
export function param(sp: Record<string, string | string[] | undefined>, k: string): string | undefined {
  const v = sp[k];
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s || undefined;
}

export function pageParam(sp: Record<string, string | string[] | undefined>): number {
  const n = Number(param(sp, "page"));
  // Bounded: offsets are Postgres integers, and no list here reaches 2,000 pages.
  return Number.isInteger(n) && n > 1 ? Math.min(n, 2000) : 1;
}

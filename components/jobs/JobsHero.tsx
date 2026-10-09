import Link from "next/link";
import { Search, MapPin, Plane, Laptop, Clock } from "lucide-react";
import type { Category } from "@/lib/cns/taxonomy";

/**
 * The search bar every /jobs view opens with (LinkedIn-style: search first,
 * results straight underneath — no empty directory screen before the jobs).
 *
 * A plain GET form, so it works before hydration and from a crawler. It
 * carries the filters already applied as hidden inputs: typing a new keyword
 * refines the search instead of silently throwing the sidebar away.
 */
export function JobsHero({
  q,
  country,
  countries,
  carried,
  total,
  quick,
}: {
  q: string;
  /** The single country chosen here, if exactly one is applied. */
  country: string;
  countries: Category[];
  /** Every applied param except q, country and page. */
  carried: [string, string][];
  total: number;
  quick: { sponsorship: boolean; remote: boolean; recent: boolean; base: string };
}) {
  const chip = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-foreground hover:border-primary/50 hover:text-primary"
    }`;

  /** Toggle one param on the current URL; always back to page 1. */
  const toggled = (param: string, value: string, on: boolean) => {
    const next = new URLSearchParams(quick.base);
    next.delete("page");
    if (on) next.delete(param);
    else next.set(param, value);
    const s = next.toString();
    return s ? `/jobs?${s}` : "/jobs";
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-card sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Find your next nursing role</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-base">
        {total > 0 ? (
          <>
            <span className="font-semibold tabular-nums text-foreground">{total.toLocaleString("en-IN")}</span>{" "}
            open {total === 1 ? "role" : "roles"} in nursing and healthcare across India, the Gulf, the UK
            and beyond.
          </>
        ) : (
          "Nursing and healthcare roles across India, the Gulf, the UK and beyond."
        )}{" "}
        Roles marked <span className="font-medium text-foreground">Easy apply</span> go to the employer
        with your Nerusalem profile in one tap.
      </p>

      <form action="/jobs" className="mt-5 grid gap-2 rounded-xl border border-border bg-card p-2 shadow-sm sm:grid-cols-[minmax(0,1fr)_220px_auto]">
        {carried.map(([k, v], i) => (
          <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
        ))}
        <label className="relative block">
          <span className="sr-only">Job title or keyword</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Job title, specialty or hospital"
            className="h-11 w-full rounded-lg bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <label className="relative block border-border sm:border-l">
          <span className="sr-only">Country</span>
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            name="country"
            defaultValue={country}
            className="h-11 w-full appearance-none rounded-lg bg-transparent pl-9 pr-3 text-sm outline-none"
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <button className="h-11 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
          Search
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={toggled("sponsorship", "1", quick.sponsorship)} scroll={false} className={chip(quick.sponsorship)}>
          <Plane className="h-3.5 w-3.5" /> Visa sponsorship
        </Link>
        <Link href={toggled("posted", "7", quick.recent)} scroll={false} className={chip(quick.recent)}>
          <Clock className="h-3.5 w-3.5" /> Posted this week
        </Link>
        <Link href={toggled("remote", "1", quick.remote)} scroll={false} className={chip(quick.remote)}>
          <Laptop className="h-3.5 w-3.5" /> Remote
        </Link>
      </div>
    </section>
  );
}

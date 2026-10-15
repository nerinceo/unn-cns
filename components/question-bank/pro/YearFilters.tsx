import { FilterSelect } from "@/components/question-bank/FilterSelect";
import { REPEAT_PATTERNS, type RepeatPattern, type YearOptions } from "@/lib/cns/qbank-pro";

/**
 * The year filters on Previous Years and Most Important (Naveen, 2026-10-15):
 * the exam years a question appeared in (any of those picked), and how it
 * repeats over the last 4 exam years. Links, like every other filter here.
 */
export function YearFilters({
  options,
  years,
  pattern,
  href,
}: {
  options: YearOptions;
  years: number[];
  pattern: RepeatPattern | undefined;
  href: (patch: Record<string, string | number | undefined>) => string;
}) {
  const span = options.window.length ? `${options.window[0]}–${options.window[options.window.length - 1]}` : "";
  const toggle = (y: number) => {
    const next = years.includes(y) ? years.filter((x) => x !== y) : [...years, y].sort((a, b) => b - a);
    return href({ years: next.length ? next.join(",") : undefined });
  };
  return (
    <>
      <FilterSelect
        variant="year"
        noun="years"
        allLabel="All exam years"
        allHref={href({ years: undefined })}
        widthClass="w-60"
        options={options.years.map((y) => ({ label: String(y.year), count: y.count, href: toggle(y.year), active: years.includes(y.year) }))}
      />
      <FilterSelect
        variant="repeat"
        allLabel="Any repeat pattern"
        allHref={href({ repeat: undefined })}
        widthClass="w-[22rem]"
        options={REPEAT_PATTERNS.map((p) => ({
          label: p.value === "often" ? p.label : `${p.label} (${span})`,
          count: options.patterns[p.value] ?? 0,
          href: href({ repeat: p.value }),
          active: p.value === pattern,
        }))}
      />
    </>
  );
}

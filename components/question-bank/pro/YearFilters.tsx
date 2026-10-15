import { FilterSelect } from "@/components/question-bank/FilterSelect";
import { REPEAT_PATTERNS, SCHEMES, type RepeatPattern, type Scheme, type YearOptions } from "@/lib/cns/qbank-pro";

/**
 * The year filters on Previous Years and Most Important (Naveen, 2026-10-15):
 * the syllabus scheme (by exam year), the exam years a question appeared in
 * (any of those picked), and how it repeats over the last 4 exam years. Links, like every other filter here.
 * Each option shows how many questions it gives for what is on screen.
 */
export function YearFilters({
  options,
  years,
  pattern,
  scheme,
  href,
}: {
  options: YearOptions;
  years: number[];
  pattern: RepeatPattern | undefined;
  scheme: Scheme | undefined;
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
        variant="paper"
        emphasizeCounts
        allLabel="All schemes"
        allHref={href({ scheme: undefined })}
        widthClass="w-72"
        options={SCHEMES.map((s) => ({ label: s.label, count: options.schemes?.[s.value] ?? 0, href: href({ scheme: s.value }), active: s.value === scheme }))}
      />
      <FilterSelect
        variant="year"
        emphasizeCounts
        noun="years"
        allLabel="All exam years"
        allHref={href({ years: undefined })}
        widthClass="w-60"
        options={options.years.map((y) => ({ label: String(y.year), count: y.count, href: toggle(y.year), active: years.includes(y.year) }))}
      />
      <FilterSelect
        variant="repeat"
        emphasizeCounts
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

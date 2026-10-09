"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Category, TaxonomyKind } from "@/lib/cns/taxonomy";

/**
 * The six primary filters (blueprint §5).
 *
 * State lives entirely in the URL, not in React: §5.7 requires searches to be
 * shareable and to survive browser navigation. Every change replaces the query
 * string, so back/forward work and a pasted link reproduces the exact search.
 */

const GROUPS: { param: string; kind: TaxonomyKind; title: string }[] = [
  { param: "country", kind: "country", title: "Country" },
  { param: "role", kind: "nursing_role", title: "Nursing role" },
  { param: "specialty", kind: "specialty", title: "Specialty" },
  { param: "type", kind: "employment_type", title: "Employment type" },
  { param: "setting", kind: "work_setting", title: "Work setting" },
  { param: "experience", kind: "experience_level", title: "Experience" },
];

/**
 * Recency. Job boards rot: a nurse who applies to a six-week-old posting is
 * usually applying to a role that was filled a month ago, and each of those
 * silent non-replies costs more trust than the extra listing was worth.
 */
const POSTED_WITHIN: { value: string; label: string }[] = [
  { value: "3", label: "Last 3 days" },
  { value: "7", label: "Last week" },
  { value: "30", label: "Last month" },
];

/**
 * Deliberately NOT here: a salary range. salary_min/max are stored in each
 * employer's own currency with no normalised column, so a "40,000+" slider
 * would compare INR to GBP and quietly hide the best-paid jobs. It needs a
 * monthly-equivalent column written at save time, not a control.
 */

/** Options shown per group before "Show all" — a 17-country list buries the rest. */
const FOLD_AT = 6;

export function JobFilters({
  taxonomy,
  selected,
  q,
}: {
  taxonomy: Record<TaxonomyKind, Category[]>;
  selected: Record<string, string[]>;
  q: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // The keyword box lives in JobsHero now; the query is still kept when the
  // filters are cleared.
  const keyword = q;

  const byParam: Record<string, string[]> = {
    country: selected.country,
    role: selected.role,
    specialty: selected.specialty,
    type: selected.employmentType,
    setting: selected.workSetting,
    experience: selected.experience,
  };

  function push(next: URLSearchParams) {
    // Any change to the query resets to page 1. Without this, narrowing a
    // 9-page search from page 7 lands on an empty page and reads as "no jobs
    // match" when the truth is "your results moved".
    next.delete("page");
    const s = next.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  function toggle(param: string, value: string) {
    const next = new URLSearchParams(params.toString());
    const current = next.getAll(param);
    next.delete(param);
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updated.forEach((v) => next.append(param, v));
    push(next);
  }

  /** Single-value params (recency) and on/off flags (sponsorship, remote). */
  function setSingle(param: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    push(next);
  }

  const postedWithin = params.get("posted");
  const sponsorship = params.get("sponsorship") === "1";
  const remote = params.get("remote") === "1";

  // Chips for everything currently applied, so it is obvious why results are
  // narrow and each one is individually removable (§5.7).
  const chips: { key: string; title: string; label: string; clear: () => void }[] = [
    ...GROUPS.flatMap(({ param, kind, title }) =>
      (byParam[param] ?? []).map((value) => ({
        key: `${param}:${value}`,
        title,
        label: taxonomy[kind].find((c) => c.value === value)?.label ?? value,
        clear: () => toggle(param, value),
      }))
    ),
    ...(postedWithin
      ? [
          {
            key: `posted:${postedWithin}`,
            title: "Posted",
            label:
              POSTED_WITHIN.find((p) => p.value === postedWithin)?.label ??
              `Last ${postedWithin} days`,
            clear: () => setSingle("posted", null),
          },
        ]
      : []),
    ...(sponsorship
      ? [
          {
            key: "sponsorship",
            title: "Sponsorship",
            label: "Visa sponsorship",
            clear: () => setSingle("sponsorship", null),
          },
        ]
      : []),
    ...(remote
      ? [
          {
            key: "remote",
            title: "Remote",
            label: "Remote only",
            clear: () => setSingle("remote", null),
          },
        ]
      : []),
  ];

  return (
    <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-4 lg:shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          Filters
          {chips.length > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
              {chips.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium lg:hidden"
          aria-expanded={open}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={c.clear}
              className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary"
              aria-label={`Remove ${c.title} filter ${c.label}`}
            >
              {c.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            onClick={() => {
              // Keyword and sort are the user's framing of the search, not a
              // narrowing of it — "clear filters" should not silently throw
              // away what they typed or how they asked it to be ordered.
              const kept = new URLSearchParams();
              if (keyword.trim()) kept.set("q", keyword.trim());
              const sort = params.get("sort");
              if (sort) kept.set("sort", sort);
              push(kept);
            }}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      )}

      <div className={cn("space-y-5", open ? "block" : "hidden lg:block")}>
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Date posted
          </legend>
          <div className="space-y-1">
            {POSTED_WITHIN.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <input
                  type="radio"
                  name="posted"
                  checked={postedWithin === o.value}
                  // Re-selecting the active option clears it; a radio group
                  // with no escape traps the search at "last 3 days".
                  onClick={() => setSingle("posted", postedWithin === o.value ? null : o.value)}
                  onChange={() => {}}
                  className="h-3.5 w-3.5"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Requirements
          </legend>
          <div className="space-y-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <input
                type="checkbox"
                checked={sponsorship}
                onChange={() => setSingle("sponsorship", sponsorship ? null : "1")}
                className="h-3.5 w-3.5"
              />
              Offers visa sponsorship
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <input
                type="checkbox"
                checked={remote}
                onChange={() => setSingle("remote", remote ? null : "1")}
                className="h-3.5 w-3.5"
              />
              Remote only
            </label>
          </div>
        </fieldset>

        {GROUPS.map(({ param, kind, title }) => {
          const options = taxonomy[kind] ?? [];
          if (!options.length) return null;
          const chosen = byParam[param] ?? [];
          // Checked options always stay visible, even inside a folded group.
          const showAll = expanded[param] || options.length <= FOLD_AT;
          const visible = showAll
            ? options
            : options.filter((o, i) => i < FOLD_AT || chosen.includes(o.value));
          return (
            <fieldset key={param}>
              <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {title}
              </legend>
              <div className="space-y-1">
                {visible.map((o) => (
                  <label
                    key={o.value}
                    className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={chosen.includes(o.value)}
                      onChange={() => toggle(param, o.value)}
                      className="h-3.5 w-3.5"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
              {options.length > FOLD_AT && (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [param]: !showAll }))}
                  className="mt-1.5 text-xs font-medium text-primary hover:underline"
                >
                  {showAll ? "Show less" : `Show all ${options.length}`}
                </button>
              )}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}

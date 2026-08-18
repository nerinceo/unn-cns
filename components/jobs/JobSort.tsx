"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowUpDown } from "lucide-react";
import { JOB_SORTS, type JobSort as Sort } from "@/lib/cns/job-constants";

const LABEL: Record<Sort, string> = {
  relevance: "Most relevant",
  recent: "Newest first",
  closing: "Closing soon",
};

/**
 * Result ordering.
 *
 * "Highest salary" is absent on purpose — see the note in JobFilters. Offering
 * it over mixed currencies would order 40,000 INR above 3,500 GBP.
 */
export function JobSort({ sort }: { sort: Sort }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <ArrowUpDown className="h-4 w-4" aria-hidden />
      <span className="sr-only sm:not-sr-only">Sort</span>
      <select
        value={sort}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === "relevance") next.delete("sort");
          else next.set("sort", e.target.value);
          next.delete("page");
          const s = next.toString();
          router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
        }}
        className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-primary"
      >
        {JOB_SORTS.map((s) => (
          <option key={s} value={s}>
            {LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  );
}

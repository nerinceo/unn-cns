"use client";

import { useMemo, useState } from "react";
import { Search, Inbox, CircleCheck, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ApplicationCard } from "./ApplicationCard";
import type { ScreeningVerdict } from "@/lib/cns/screening";

/**
 * The hiring pipeline.
 *
 * Stages are TABS with live counts, not drag-between-columns. An applicant
 * card carries a name, a verified badge, contact details, a cover note and an
 * expandable profile — three hundred pixels tall. Six columns of those is a
 * horizontal scroll on a laptop and unusable on a phone, which is where a ward
 * manager actually reads them. The funnel bar gives the at-a-glance shape a
 * board is wanted for; the tabs give a working list per stage.
 */

export type PipelineRow = {
  id: string;
  jobId: string;
  jobTitle: string;
  /** HUB user id — the employer's route through to the living profile. */
  applicantId: string;
  /**
   * Whether a CV is attached at all. Only a flag: the signed URL is minted on
   * click, so a page of thirty applicants does not mint thirty ten-minute
   * links that nobody opens.
   */
  hasResume: boolean;
  snapshot: Record<string, unknown>;
  coverNote: string | null;
  status: string;
  employerNote: string | null;
  createdAt: string;
  contact: { email: string | null; phone: string | null } | null;
  applicantName: string;
  /** 0–100 fit against this job, or null when the profile is too thin. */
  matchPercent: number | null;
  screening: ScreeningVerdict;
};

/** Ordered as the funnel runs; the two terminal states sit apart at the end. */
const STAGES: { value: string; label: string }[] = [
  { value: "applied", label: "Applied" },
  { value: "under_review", label: "Under review" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interview", label: "Interview" },
  { value: "selected", label: "Selected" },
  { value: "not_selected", label: "Not selected" },
  { value: "withdrawn", label: "Withdrawn" },
];

const SORTS = [
  { value: "recent", label: "Newest first" },
  { value: "match", label: "Best match" },
  { value: "screening", label: "Meets criteria first" },
] as const;

type Sort = (typeof SORTS)[number]["value"];

export function ApplicationPipeline({ rows }: { rows: PipelineRow[] }) {
  const [stage, setStage] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [onlyQualified, setOnlyQualified] = useState(false);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) c.set(r.status, (c.get(r.status) ?? 0) + 1);
    return c;
  }, [rows]);

  const hasRules = rows.some((r) => r.screening.ruleCount > 0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (stage !== "all" && r.status !== stage) return false;
      if (onlyQualified && !r.screening.meetsCriteria) return false;
      if (!q) return true;
      // Job title is searched too: an employer running six wards thinks in
      // roles ("who applied to the night ICU post") as often as in names.
      return (
        r.applicantName.toLowerCase().includes(q) || r.jobTitle.toLowerCase().includes(q)
      );
    });

    out = [...out].sort((a, b) => {
      if (sort === "match") return (b.matchPercent ?? -1) - (a.matchPercent ?? -1);
      if (sort === "screening") {
        const rank = (r: PipelineRow) =>
          r.screening.ruleCount === 0 ? 1 : r.screening.meetsCriteria ? 2 : 0;
        const d = rank(b) - rank(a);
        if (d !== 0) return d;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return out;
  }, [rows, stage, query, sort, onlyQualified]);

  const qualified = rows.filter((r) => r.screening.meetsCriteria).length;

  return (
    <div className="space-y-4">
      {/* Funnel — the shape of the pipeline at a glance. */}
      <div className="flex flex-wrap gap-1.5">
        <StageTab
          label="All"
          count={rows.length}
          active={stage === "all"}
          onClick={() => setStage("all")}
        />
        {STAGES.map((s) => {
          const n = counts.get(s.value) ?? 0;
          // An empty terminal stage is noise; an empty active stage is
          // information ("nothing shortlisted yet") and stays.
          if (n === 0 && (s.value === "withdrawn" || s.value === "not_selected")) return null;
          return (
            <StageTab
              key={s.value}
              label={s.label}
              count={n}
              active={stage === s.value}
              onClick={() => setStage(s.value)}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by applicant or role"
            aria-label="Search applications"
            className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-primary"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {hasRules && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyQualified}
              onChange={(e) => setOnlyQualified(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Meets criteria only
            <span className="tabular-nums">({qualified})</span>
          </label>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Nothing here</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {query || onlyQualified
              ? "No applications match that search."
              : "No applications at this stage yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <div key={r.id} className="space-y-0">
              <ScreeningTags row={r} />
              <ApplicationCard
                id={r.id}
                jobTitle={r.jobTitle}
                snapshot={r.snapshot}
                coverNote={r.coverNote}
                status={r.status}
                employerNote={r.employerNote}
                createdAt={r.createdAt}
                contact={r.contact}
                matchPercent={r.matchPercent}
                applicantId={r.applicantId}
                hasResume={r.hasResume}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StageTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-primary bg-primary/5 font-medium text-primary"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
      )}
    >
      {label}
      <span className="tabular-nums text-xs">{count}</span>
    </button>
  );
}

/**
 * The screening verdict, above the card.
 *
 * Deliberately a tag and not a filter-by-default: a failed rule never hides an
 * application. A nurse whose registration lands next month is precisely who a
 * hard cut would throw away.
 */
function ScreeningTags({ row }: { row: PipelineRow }) {
  const { screening } = row;
  if (screening.ruleCount === 0) return null;

  const met = screening.meetsCriteria;
  const detail = met
    ? `Met all ${screening.ruleCount} screening criteria`
    : [...screening.failures, ...screening.unanswered.map((u) => `${u} — not answered`)].join(
        " · "
      );

  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-2">
      <span
        title={detail}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
          met
            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
            : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
        )}
      >
        {met ? (
          <CircleCheck className="h-3 w-3" aria-hidden />
        ) : (
          <CircleAlert className="h-3 w-3" aria-hidden />
        )}
        {met
          ? "Meets criteria"
          : `Meets ${screening.metCount} of ${screening.ruleCount} criteria`}
      </span>
    </div>
  );
}

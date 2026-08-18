import { Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { matchTone, type MatchResult } from "@/lib/cns/job-match";

/**
 * The match score on a job card.
 *
 * Renders nothing when the score is null. A profile with nothing in it cannot
 * produce an honest number, and a confident "12% match" on every row is worse
 * than no signal at all — people stop reading the badge entirely.
 */
export function MatchBadge({ match, className }: { match: MatchResult; className?: string }) {
  if (match.percent === null) return null;
  const tone = matchTone(match.percent);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "strong" && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
        tone === "good" && "bg-primary/5 text-primary ring-1 ring-primary/20",
        tone === "weak" && "bg-muted text-muted-foreground ring-1 ring-border",
        className
      )}
      title={match.reasons.join(" · ") || undefined}
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      {match.percent}% match
    </span>
  );
}

/** The one or two things that made it a match, under the card metadata. */
export function MatchReasons({ match }: { match: MatchResult }) {
  if (match.percent === null || (!match.reasons.length && !match.gaps.length)) return null;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {match.reasons.map((r) => (
        <span key={r} className="text-emerald-700">
          {r}
        </span>
      ))}
      {match.gaps.map((g) => (
        <span key={g} className="inline-flex items-center gap-1 text-amber-700">
          <TriangleAlert className="h-3 w-3" aria-hidden />
          {g}
        </span>
      ))}
    </div>
  );
}

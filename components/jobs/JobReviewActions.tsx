"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reviewJob } from "@/lib/actions/admin-jobs";
import { settle } from "@/lib/utils/settle";

type Decision = "active" | "rejected" | "changes_requested" | "paused" | "removed";

/**
 * Staff decision on a job.
 *
 * Anything other than approval opens a reason box first. §9.2 requires a
 * reason, and it is also the difference between an employer who can fix the
 * posting themselves and one who has to email support.
 */
export function JobReviewActions({
  jobId,
  compact,
  current,
}: {
  jobId: string;
  compact?: boolean;
  current?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function go(decision: Decision, why?: string) {
    start(async () => {
      setError(null);
      const res = await settle(reviewJob(jobId, decision, why));
      if (res?.error) {
        setError(res.error);
        return;
      }
      setAsking(null);
      setReason("");
      router.refresh();
    });
  }

  if (compact) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {current === "active" ? (
          <Button size="sm" variant="ghost" onClick={() => setAsking("removed")} disabled={pending}>
            Remove
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => go("active")} disabled={pending}>
            Approve
          </Button>
        )}
        {asking && (
          <>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason"
              className="h-8 w-40 rounded-md border border-border bg-card px-2 text-xs outline-none focus:border-primary"
            />
            <Button
              size="sm"
              variant="destructive"
              onClick={() => go(asking, reason)}
              disabled={pending || !reason.trim()}
            >
              Confirm
            </Button>
          </>
        )}
        {error && <span className="text-xs text-secondary">{error}</span>}
      </span>
    );
  }

  return (
    <div className="shrink-0 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => go("active")} disabled={pending}>
          {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAsking("changes_requested")}
          disabled={pending}
        >
          Request changes
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAsking("rejected")} disabled={pending}>
          Reject
        </Button>
      </div>

      {asking && (
        <div className="space-y-2 rounded-md border border-border p-2">
          <p className="text-xs font-medium">
            {asking === "changes_requested" ? "What needs changing?" : "Why is this rejected?"}
          </p>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="This is sent to the employer"
            className="w-64 rounded-md border border-border bg-card p-2 text-xs outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => go(asking, reason)}
              disabled={pending || !reason.trim()}
            >
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-secondary">{error}</p>}
    </div>
  );
}

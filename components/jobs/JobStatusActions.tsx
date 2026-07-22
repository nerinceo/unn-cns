"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { submitJobForReview, setJobLifecycle } from "@/lib/actions/jobs";

/**
 * Employer-side job lifecycle.
 *
 * There is no Publish button any more: blueprint §3 requires every job to be
 * approved by an admin before it is publicly visible, so the employer's action
 * is Submit for review. Pause, resume and close stay with the employer, since
 * none of them put new content in front of the public.
 */
export function JobStatusActions({
  jobId,
  status,
  canPublish,
}: {
  jobId: string;
  status: string;
  /** False while the organisation itself is still awaiting approval. */
  canPublish: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error?: string } | undefined>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res?.error) setError(res.error);
      else router.refresh();
    });

  return (
    <span className="flex flex-wrap items-center gap-2">
      {(status === "draft" || status === "changes_requested") && (
        <button
          onClick={() => run(() => submitJobForReview(jobId))}
          disabled={pending || !canPublish}
          title={canPublish ? undefined : "Your organisation is awaiting approval"}
          className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          Submit for review
        </button>
      )}

      {status === "submitted" && (
        <span className="text-xs text-muted-foreground">Awaiting UNN review</span>
      )}

      {status === "active" && (
        <>
          <button
            onClick={() => run(() => setJobLifecycle(jobId, "paused"))}
            disabled={pending}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Pause
          </button>
          <button
            onClick={() => run(() => setJobLifecycle(jobId, "closed"))}
            disabled={pending}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Close
          </button>
        </>
      )}

      {status === "paused" && (
        <button
          onClick={() => run(() => setJobLifecycle(jobId, "active"))}
          disabled={pending}
          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
        >
          Resume
        </button>
      )}

      {error && <span className="w-full text-xs text-secondary">{error}</span>}
    </span>
  );
}

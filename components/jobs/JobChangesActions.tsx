"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reviewJobChanges } from "@/lib/actions/admin-jobs";
import { settle } from "@/lib/utils/settle";

/**
 * Staff decision on the changes waiting on a live role. Rejecting needs a
 * reason — the employer is told why, and the role stays live as it was.
 */
export function JobChangesActions({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function go(decision: "approve" | "reject") {
    start(async () => {
      setError(null);
      const res = await settle(reviewJobChanges(jobId, decision, decision === "reject" ? reason : undefined));
      if (res?.error) return setError(res.error);
      setRejecting(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="shrink-0 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => go("approve")} disabled={pending}>
          {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Approve changes
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={pending}>
          Reject changes
        </Button>
      </div>
      {rejecting && (
        <div className="space-y-2 rounded-md border border-border p-2">
          <p className="text-xs font-medium">Why are these changes rejected?</p>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="This is sent to the employer"
            className="w-64 rounded-md border border-border bg-card p-2 text-xs outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={() => go("reject")} disabled={pending || !reason.trim()}>
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-secondary">{error}</p>}
    </div>
  );
}

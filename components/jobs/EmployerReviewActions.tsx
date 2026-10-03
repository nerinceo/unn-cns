"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reviewEmployer } from "@/lib/actions/admin-jobs";
import { settle } from "@/lib/utils/settle";

export function EmployerReviewActions({
  employerId,
  compact,
  current,
}: {
  employerId: string;
  compact?: boolean;
  current?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);

  function go(decision: "approved" | "rejected" | "suspended") {
    start(async () => {
      setError(null);
      const res = await settle(reviewEmployer(employerId, decision, note || undefined));
      if (res?.error) setError(res.error);
      // revalidatePath alone does not re-render this client component's parent.
      else router.refresh();
      setAsking(false);
      setNote("");
    });
  }

  if (compact) {
    return (
      <div className="flex gap-1.5">
        {current !== "approved" && (
          <Button size="sm" variant="outline" onClick={() => go("approved")} disabled={pending}>
            Approve
          </Button>
        )}
        {current === "approved" && (
          <Button size="sm" variant="ghost" onClick={() => go("suspended")} disabled={pending}>
            Suspend
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="shrink-0 space-y-2">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => go("approved")} disabled={pending}>
          {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAsking((v) => !v)} disabled={pending}>
          Reject
        </Button>
      </div>
      {asking && (
        <div className="space-y-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason (sent to them)"
            className="h-9 w-56 rounded-md border border-border bg-card px-2.5 text-sm outline-none focus:border-primary"
          />
          <Button size="sm" variant="destructive" onClick={() => go("rejected")} disabled={pending}>
            Confirm rejection
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-secondary">{error}</p>}
    </div>
  );
}

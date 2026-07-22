"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { publishJob } from "@/lib/actions/jobs";

/** Publish a draft, or close a live role. */
export function JobStatusActions({
  jobId,
  status,
  canPublish,
}: {
  jobId: string;
  status: string;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go(publish: boolean) {
    start(async () => {
      setError(null);
      const res = await publishJob(jobId, publish);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const canAct = status === "draft" || status === "pending_review" || status === "published";
  if (!canAct) return null;

  return (
    <span className="flex flex-wrap items-center gap-2">
      {status === "published" ? (
        <button
          onClick={() => go(false)}
          disabled={pending}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Close
        </button>
      ) : (
        <button
          onClick={() => go(true)}
          disabled={pending || !canPublish}
          title={canPublish ? undefined : "Your organisation is awaiting approval"}
          className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          Publish
        </button>
      )}
      {error && <span className="w-full text-xs text-secondary">{error}</span>}
    </span>
  );
}

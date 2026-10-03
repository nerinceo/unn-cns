"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { toggleSaveJob } from "@/lib/actions/jobs";
import { settle } from "@/lib/utils/settle";

export function SaveJobButton({
  jobId,
  saved: initial,
  withLabel,
}: {
  jobId: string;
  saved: boolean;
  withLabel?: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();

  return (
    <button
      onClick={(e) => {
        // Cards wrap this in a link; saving must not navigate.
        e.preventDefault();
        e.stopPropagation();
        const next = !saved;
        setSaved(next); // optimistic — a save should feel instant
        start(async () => {
          const res = await settle(toggleSaveJob(jobId, next));
          if (res?.error) setSaved(!next);
          else router.refresh();
        });
      }}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved jobs" : "Save this job"}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
        saved
          ? "border-primary/40 bg-primary/5 text-primary"
          : "border-border text-muted-foreground hover:border-primary/40"
      )}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Bookmark className={cn("h-3.5 w-3.5", saved && "fill-current")} />
      )}
      {withLabel && (saved ? "Saved" : "Save")}
    </button>
  );
}

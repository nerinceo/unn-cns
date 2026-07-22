"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { resolveReport } from "@/lib/actions/admin-jobs";

export function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function go(status: "resolved" | "dismissed") {
    start(async () => {
      setError(null);
      const res = await resolveReport(reportId, status, note || undefined);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2 text-right">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Resolution note"
        className="h-8 w-48 rounded-md border border-border bg-card px-2 text-xs outline-none focus:border-primary"
      />
      <div className="flex gap-1.5">
        <Button size="sm" onClick={() => go("resolved")} disabled={pending}>
          Resolved
        </Button>
        <Button size="sm" variant="outline" onClick={() => go("dismissed")} disabled={pending}>
          Dismiss
        </Button>
      </div>
      {error && <p className="text-xs text-secondary">{error}</p>}
    </div>
  );
}

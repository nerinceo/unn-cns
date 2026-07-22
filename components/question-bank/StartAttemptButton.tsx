"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startAttempt } from "@/lib/actions/attempts";

export function StartAttemptButton({ setId, disabled }: { setId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go() {
    setError(null);
    start(async () => {
      const res = await startAttempt(setId);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      if ("attemptId" in res) router.push(`/question-bank/attempt/${res.attemptId}`);
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={go} disabled={disabled || pending} size="lg" className="w-full sm:w-auto">
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing…
          </>
        ) : (
          <>
            <Play className="mr-2 h-4 w-4" /> Start
          </>
        )}
      </Button>
      {disabled && (
        <p className="text-sm text-muted-foreground">This set has no questions yet.</p>
      )}
      {error && <p className="text-sm text-secondary">{error}</p>}
    </div>
  );
}

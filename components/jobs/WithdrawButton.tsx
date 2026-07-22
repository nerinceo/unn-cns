"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withdrawApplication } from "@/lib/actions/jobs";

export function WithdrawButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-muted-foreground underline hover:text-foreground"
      >
        Withdraw
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span>Withdraw this application?</span>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await withdrawApplication(applicationId);
            router.refresh();
          })
        }
        className="font-medium text-secondary underline"
      >
        Yes
      </button>
      <button onClick={() => setConfirming(false)} className="underline">
        No
      </button>
    </span>
  );
}

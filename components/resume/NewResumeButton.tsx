"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createResume } from "@/lib/actions/resume";

export function NewResumeButton({ hasAny }: { hasAny: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      onClick={() =>
        start(async () => {
          const res = await createResume();
          if ("id" in res && res.id) router.push(`/resume/${res.id}`);
        })
      }
      disabled={pending}
      variant={hasAny ? "outline" : "default"}
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…
        </>
      ) : (
        <>
          <Plus className="mr-2 h-4 w-4" /> {hasAny ? "New resume" : "Create my resume"}
        </>
      )}
    </Button>
  );
}

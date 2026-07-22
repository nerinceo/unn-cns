"use client";

import { useState, useTransition } from "react";
import { Share2, Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleShare } from "@/lib/actions/resume";

export function ShareControl({ resumeId, token }: { resumeId: string; token: string | null }) {
  const [current, setCurrent] = useState(token);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const url = current ? `${typeof window !== "undefined" ? window.location.origin : ""}/r/${current}` : null;

  function flip(share: boolean) {
    start(async () => {
      const res = await toggleShare(resumeId, share);
      if ("token" in res) setCurrent(res.token ?? null);
    });
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (!current) {
    return (
      <Button variant="outline" size="sm" onClick={() => flip(true)} disabled={pending}>
        {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Share2 className="mr-1.5 h-3.5 w-3.5" />}
        Get shareable link
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="max-w-[240px] truncate rounded border border-border bg-muted px-2 py-1 text-xs">
        {url}
      </code>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      {/* Revoking mints a new token next time, so an old link stays dead. */}
      <Button variant="ghost" size="sm" onClick={() => flip(false)} disabled={pending}>
        Stop sharing
      </Button>
    </div>
  );
}

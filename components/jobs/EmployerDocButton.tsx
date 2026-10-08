"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEmployerDocUrl } from "@/lib/actions/employer-docs";
import { settle } from "@/lib/utils/settle";

/**
 * Opens an organisation's registration document for the reviewer. The link is
 * a short-lived presigned URL minted on click; entitlement (staff or a member)
 * is checked by getEmployerDocUrl, not here.
 */
export function EmployerDocButton({ employerId }: { employerId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    const res = await settle(getEmployerDocUrl(employerId));
    setBusy(false);
    if (res && "url" in res && res.url) window.open(res.url, "_blank", "noopener,noreferrer");
    else setError((res && "error" in res && res.error) || "Could not open that document.");
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={open} disabled={busy}>
        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
        Registration document
      </Button>
      {error && <span className="text-xs text-secondary">{error}</span>}
    </span>
  );
}

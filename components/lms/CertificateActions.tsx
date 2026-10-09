"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, Printer } from "lucide-react";

const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50";
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const btnOutline = `${btn} border border-border bg-background hover:bg-muted`;

/** Learner's page: open the printable copy, or copy the public check link. */
export function CertificateActions({ verifyUrl }: { verifyUrl: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`${verifyUrl}?print=1`} target="_blank" rel="noopener" className={btnPrimary}>
        <Download className="h-4 w-4" />
        Download PDF
      </a>
      <button
        type="button"
        className={btnOutline}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(verifyUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            window.prompt("Copy this verification link", verifyUrl);
          }
        }}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy verification link"}
      </button>
    </div>
  );
}

/**
 * Public page: "Download PDF" is the browser's own print-to-PDF — no PDF
 * library, and the file is exactly the page an employer verifies. Opened with
 * ?print=1 (from the learner's page) it starts the dialog straight away.
 */
export function PrintCertificate({ autoPrint }: { autoPrint: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [autoPrint]);

  return (
    <button type="button" className={btnOutline} onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      Download or print (PDF)
    </button>
  );
}

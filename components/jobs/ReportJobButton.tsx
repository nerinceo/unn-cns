"use client";

import { useState, useTransition } from "react";
import { Flag, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportJob } from "@/lib/actions/jobs";

/**
 * Safety notice and Report Job (blueprint §15).
 *
 * The named risks for a nursing job board are visa and placement scams, and
 * the pattern is always the same: an applicant is asked for money. So the
 * notice states the one rule plainly rather than listing generic advice, and
 * "Asked me for payment" is the first reason offered — the reason we most want
 * reported is the one that should take the fewest clicks.
 *
 * Reporting is available to signed-in members only; the action returns
 * "Not signed in" otherwise, and rate limiting caps abuse of the queue.
 */
const REASONS: { value: string; label: string }[] = [
  { value: "payment_request", label: "Asked me for payment" },
  { value: "suspicious_job", label: "Looks like a scam" },
  { value: "inaccurate_information", label: "Details are inaccurate" },
  { value: "discrimination", label: "Discriminatory wording" },
  { value: "expired_job", label: "Role is no longer open" },
  { value: "duplicate_job", label: "Duplicate posting" },
  { value: "other", label: "Something else" },
];

export function ReportJobButton({ jobId, canReport }: { jobId: string; canReport: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0].value);
  const [detail, setDetail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="rounded-lg border border-border bg-muted/40 p-4">
      <p className="flex items-start gap-2 text-sm">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
        <span>
          <strong className="font-medium">Nerusalem never asks you to pay for a job.</strong> No genuine
          employer on this board will ask you for a fee, a deposit, or your bank details to secure a
          role or a visa. If one does, report it.
        </span>
      </p>

      {done ? (
        <p className="mt-3 text-sm text-primary">
          Thank you — our team will review this posting.
        </p>
      ) : open ? (
        <div className="mt-3 space-y-2">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm sm:max-w-xs"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <textarea
            rows={3}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Anything else we should know? (optional)"
            className="w-full rounded-md border border-border bg-card p-3 text-sm outline-none focus:border-primary"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await reportJob(jobId, reason, detail.trim() || undefined);
                  if (res?.error) setError(res.error);
                  else setDone(true);
                })
              }
            >
              Send report
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {error && <p className="text-sm text-secondary">{error}</p>}
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={() => (canReport ? setOpen(true) : setError("Sign in to report a posting."))}
        >
          <Flag className="mr-1.5 h-3.5 w-3.5" /> Report this job
        </Button>
      )}
      {!open && error && <p className="mt-2 text-sm text-secondary">{error}</p>}
    </section>
  );
}

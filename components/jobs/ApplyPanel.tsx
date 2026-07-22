"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyToJob } from "@/lib/actions/jobs";
import { hubLink } from "@/lib/hub";

/**
 * Apply call to action.
 *
 * Anonymous visitors — which is most of the traffic, since these pages are
 * indexed — see the value proposition and a sign-in prompt rather than a dead
 * button. Signing in returns them here.
 */
export function ApplyPanel({
  jobId, jobSlug, applyMode, externalUrl, signedIn, deadline,
}: {
  jobId: string;
  jobSlug: string;
  applyMode: string;
  externalUrl: string | null;
  signedIn: boolean;
  deadline: string | null;
}) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const closed = deadline ? new Date(deadline) < new Date() : false;

  if (closed) {
    return (
      <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
        Applications for this role have closed.
      </div>
    );
  }

  if (applyMode === "external" && externalUrl) {
    return (
      <a
        href={externalUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Apply on employer site <ExternalLink className="ml-2 h-4 w-4" />
      </a>
    );
  }

  if (!signedIn) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Apply in one tap with your UNN profile
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Employers see your verified nursing credentials — no CV upload, no re-typing your
          history.
        </p>
        <a
          href={hubLink(`/welcome?next=${encodeURIComponent(`/jobs/${jobSlug}`)}`)}
          className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Sign in to apply
        </a>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
        <Check className="h-4 w-4 text-primary" />
        <span>
          Application sent. You can track it under{" "}
          <a href="/jobs/applications" className="text-primary underline">
            your applications
          </a>
          .
        </span>
      </div>
    );
  }

  if (!open) {
    return (
      <Button size="lg" onClick={() => setOpen(true)}>
        Apply with my UNN profile
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Add a note (optional)</span>
        <span className="mb-2 block text-xs text-muted-foreground">
          A sentence or two on why this role suits you.
        </span>
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-md border border-border bg-card p-3 text-sm outline-none focus:border-primary"
        />
      </label>

      <p className="mt-3 text-xs text-muted-foreground">
        Your name, title, verification status, education, experience and skills are shared with
        this employer. Your email and phone number are <strong>not</strong> shared unless they
        shortlist you.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <Button
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await applyToJob(jobId, { coverNote: note || undefined });
              if (res?.error) setError(res.error);
              else setDone(true);
            })
          }
          disabled={pending}
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
            </>
          ) : (
            "Send application"
          )}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-secondary">{error}</p>}
    </div>
  );
}

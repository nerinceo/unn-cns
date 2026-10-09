"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, Loader2, ShieldCheck, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyToJob } from "@/lib/actions/jobs";
import { settle } from "@/lib/utils/settle";
import { hubLink } from "@/lib/hub";
import { deadlinePassed } from "@/lib/cns/job-constants";
import { safeExternalUrl } from "@/lib/cns/url";

export type ScreeningQuestion = {
  id: string;
  question: string;
  question_type: "short_answer" | "yes_no" | "number";
  is_required: boolean;
};

export type ResumeChoice = { id: string; label: string; kind: "file" | "built" };

/**
 * Apply (blueprint §6.2).
 *
 * Anonymous visitors — most of the traffic, since these pages are indexed —
 * get the value proposition and a sign-in prompt rather than a dead button.
 */
export function ApplyPanel({
  jobId, jobSlug, applyMode, externalUrl, sourceName = null, signedIn, deadline,
  questions = [], resumes = [], alreadyApplied, withdrawn = false, ended = false,
}: {
  jobId: string;
  jobSlug: string;
  applyMode: string;
  externalUrl: string | null;
  /** An imported role's source, for "Apply on <source>". */
  sourceName?: string | null;
  signedIn: boolean;
  deadline: string | null;
  questions?: ScreeningQuestion[];
  resumes?: ResumeChoice[];
  alreadyApplied?: boolean;
  /** The member applied and later withdrew. Re-applying is not possible. */
  withdrawn?: boolean;
  /** Paused, closed or expired by the employer or the deadline cron. */
  ended?: boolean;
}) {
  const [note, setNote] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resumeChoice, setResumeChoice] = useState(resumes[0]?.id ?? "");
  const [declared, setDeclared] = useState(false);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const closed = deadlinePassed(deadline);

  if (withdrawn) {
    return (
      <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
        You withdrew your application for this role. See{" "}
        <a href="/applications" className="text-primary underline">your applications</a>.
      </div>
    );
  }

  if (closed || ended) {
    return (
      <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
        {alreadyApplied ? (
          <>
            This role is no longer accepting applications. Yours is still with the employer — track it
            under <a href="/applications" className="text-primary underline">your applications</a>.
          </>
        ) : (
          "Applications for this role have closed."
        )}
      </div>
    );
  }

  if (alreadyApplied || done) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
        <Check className="h-4 w-4 text-primary" />
        <span>
          Application sent. Track it under{" "}
          <a href="/applications" className="text-primary underline">your applications</a>.
        </span>
      </div>
    );
  }

  // Re-checked at render: a stored link that is not http(s) (javascript:,
  // data:) must never become an href.
  const safeUrl = applyMode === "external" ? safeExternalUrl(externalUrl) : null;
  if (safeUrl) {
    return (
      <a
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {sourceName ? `Apply on ${sourceName}` : "Apply on employer site"}
        <ExternalLink className="ml-2 h-4 w-4" />
      </a>
    );
  }

  if (!signedIn) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Apply in one tap with your Nerusalem profile
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Employers see your verified nursing credentials — no CV upload, no re-typing your history.
        </p>
        <a
          href={hubLink(`/welcome?next=${encodeURIComponent(`/jobs/${jobSlug}`)}`)}
          className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
        >
          Sign in to apply
        </a>
      </div>
    );
  }

  if (!open) {
    return (
      <Button size="lg" onClick={() => setOpen(true)}>
        Apply with my Nerusalem profile
      </Button>
    );
  }

  const chosen = resumes.find((r) => r.id === resumeChoice);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
      {resumes.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Attach a CV</span>
          <select
            value={resumeChoice}
            onChange={(e) => setResumeChoice(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
          >
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
            <option value="">Apply without a CV</option>
          </select>
        </label>
      )}
      {resumes.length === 0 && (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          You have no CV yet. You can still apply — your Nerusalem profile is sent — but adding one from
          the <a href="/resume" className="text-primary underline">Resume</a> page helps.
        </p>
      )}

      {questions.map((q) => (
        <label key={q.id} className="block">
          <span className="mb-1 block text-sm font-medium">
            {q.question}
            {q.is_required && <span className="ml-1 text-secondary">*</span>}
          </span>
          {q.question_type === "yes_no" ? (
            <select
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
            >
              <option value="">Select</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          ) : (
            <input
              // A numeric question is scored against a threshold, so it has to
              // come back as a number — "about three years" cannot be compared
              // to anything.
              type={q.question_type === "number" ? "number" : "text"}
              min={q.question_type === "number" ? 0 : undefined}
              step={q.question_type === "number" ? "0.5" : undefined}
              inputMode={q.question_type === "number" ? "decimal" : undefined}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary"
            />
          )}
        </label>
      ))}

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Add a note (optional)</span>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-md border border-border bg-card p-3 text-sm outline-none focus:border-primary"
        />
      </label>

      {/* §6.2 step 6 — declaration and privacy notice, required. */}
      <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-xs">
        <input
          type="checkbox"
          checked={declared}
          onChange={(e) => setDeclared(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-muted-foreground">
          I confirm the information I have provided is accurate, and I agree to it being shared with
          this employer for the purpose of this application. My name, professional details,
          verification status{chosen ? " and attached CV" : ""} are shared.{" "}
          <strong className="text-foreground">
            My email and phone number are not shared unless the employer shortlists me.
          </strong>
        </span>
      </label>

      <div className="flex items-center gap-2">
        <Button
          disabled={pending || !declared}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await settle(applyToJob(jobId, {
                coverNote: note || undefined,
                resumeFileId: chosen?.kind === "file" ? chosen.id : undefined,
                resumeId: chosen?.kind === "built" ? chosen.id : undefined,
                answers: questions.map((q) => ({
                  questionId: q.id,
                  questionText: q.question,
                  answer: answers[q.id] ?? "",
                })),
                declarationAccepted: declared,
              }));
              if (res?.error) setError(res.error);
              else setDone(true);
            })
          }
        >
          {pending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
          ) : (
            "Send application"
          )}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {error && <p className="text-sm text-secondary">{error}</p>}
    </div>
  );
}

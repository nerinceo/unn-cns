"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Mail, Phone, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { setApplicationStatus } from "@/lib/actions/jobs";

const NEXT_STATUS: Record<string, { label: string; value: string }[]> = {
  submitted: [
    { label: "Shortlist", value: "shortlisted" },
    { label: "Reject", value: "rejected" },
  ],
  viewed: [
    { label: "Shortlist", value: "shortlisted" },
    { label: "Reject", value: "rejected" },
  ],
  shortlisted: [
    { label: "Move to interview", value: "interview" },
    { label: "Reject", value: "rejected" },
  ],
  interview: [
    { label: "Make offer", value: "offered" },
    { label: "Reject", value: "rejected" },
  ],
};

type Snapshot = {
  full_name?: string;
  professional_title?: string;
  bio?: string;
  country?: string;
  verification_status?: string;
  education?: { degree?: string; institution?: string; end_year?: string }[];
  experience?: { title?: string; employer?: string }[];
  skills?: string[];
};

export function ApplicationCard({
  id, jobTitle, snapshot, coverNote, status, employerNote, createdAt, contact,
}: {
  id: string;
  jobTitle: string;
  snapshot: Record<string, unknown>;
  coverNote: string | null;
  status: string;
  employerNote: string | null;
  createdAt: string;
  contact: { email: string | null; phone: string | null } | null;
}) {
  const s = snapshot as Snapshot;
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(status);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const verified = s.verification_status === "verified";
  const actions = NEXT_STATUS[current] ?? [];

  function move(next: string) {
    start(async () => {
      setError(null);
      const res = await setApplicationStatus(id, next);
      if (res?.error) setError(res.error);
      // Refresh so contact details appear immediately on shortlist.
      else { setCurrent(next); router.refresh(); }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {s.full_name ?? "Applicant"}
            {verified && (
              <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                <ShieldCheck className="h-3 w-3" /> Verified nurse
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {s.professional_title ?? "—"}
            {s.country && ` · ${s.country}`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {jobTitle} · applied {new Date(createdAt).toLocaleDateString()}
          </p>
        </div>
        <span
          className={cn(
            "rounded px-2 py-0.5 text-xs font-medium capitalize",
            current === "rejected"
              ? "bg-muted text-muted-foreground"
              : current === "submitted"
                ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-primary"
          )}
        >
          {current}
        </span>
      </div>

      {/* Released only after shortlisting — the promise made on the apply screen. */}
      {contact && (contact.email || contact.phone) && (
        <div className="mt-3 flex flex-wrap gap-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-primary hover:underline">
              <Mail className="h-3.5 w-3.5" /> {contact.email}
            </a>
          )}
          {contact.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> {contact.phone}
            </span>
          )}
        </div>
      )}

      {coverNote && (
        <p className="mt-3 border-l-2 border-border pl-3 text-sm text-muted-foreground">
          {coverNote}
        </p>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        {open ? "Hide" : "View"} profile as submitted
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
          {s.bio && <p className="text-muted-foreground">{s.bio}</p>}
          {!!s.experience?.length && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Experience
              </p>
              <ul className="mt-1 space-y-0.5">
                {s.experience.map((e, i) => (
                  <li key={i}>
                    {e.title}
                    {e.employer && ` — ${e.employer}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!s.education?.length && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Education
              </p>
              <ul className="mt-1 space-y-0.5">
                {s.education.map((e, i) => (
                  <li key={i}>
                    {e.degree}
                    {e.institution && ` — ${e.institution}`}
                    {e.end_year && ` (${e.end_year})`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!s.skills?.length && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Skills
              </p>
              <p className="mt-1">{s.skills.join(", ")}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            This is a snapshot taken when they applied, so it cannot change afterwards.
          </p>
        </div>
      )}

      {employerNote && (
        <p className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
          Your note: {employerNote}
        </p>
      )}

      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {actions.map((a) => (
            <Button
              key={a.value}
              size="sm"
              variant={a.value === "rejected" ? "outline" : "default"}
              onClick={() => move(a.value)}
              disabled={pending}
            >
              {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {a.label}
            </Button>
          ))}
          {current === "submitted" && (
            <span className="text-xs text-muted-foreground">
              Shortlisting reveals their email and phone.
            </span>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-secondary">{error}</p>}
    </div>
  );
}

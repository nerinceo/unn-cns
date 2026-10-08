"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Mail, Phone, ChevronDown, Loader2, Sparkles, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/date";
import { setApplicationStatus, getApplicationResumeUrl } from "@/lib/actions/jobs";
import { settle } from "@/lib/utils/settle";
import { hubLink } from "@/lib/hub";

// Keyed on the status vocabulary the database enforces
// (cns_job_applications_status_check): applied, under_review, shortlisted,
// interview, selected, not_selected, withdrawn. These were on the pre-blueprint
// names (submitted/viewed/offered/rejected), so an application sitting at
// 'applied' matched no key and the employer saw NO action buttons at all.
const NEXT_STATUS: Record<string, { label: string; value: string }[]> = {
  applied: [
    { label: "Mark under review", value: "under_review" },
    { label: "Shortlist", value: "shortlisted" },
    { label: "Not selected", value: "not_selected" },
  ],
  under_review: [
    { label: "Shortlist", value: "shortlisted" },
    { label: "Not selected", value: "not_selected" },
  ],
  shortlisted: [
    { label: "Move to interview", value: "interview" },
    { label: "Not selected", value: "not_selected" },
  ],
  interview: [
    { label: "Select", value: "selected" },
    { label: "Not selected", value: "not_selected" },
  ],
};

/** Raw status -> what the employer should read on the badge. */
const STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  under_review: "Under review",
  shortlisted: "Shortlisted",
  interview: "Interview",
  selected: "Selected",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
};

type Seeker = {
  nursing_role?: string | null;
  is_student?: boolean;
  experience_level?: string | null;
  total_years?: number | null;
  specialties?: string[];
  licence_country?: string | null;
  licence_type?: string | null;
  licence_status?: string | null;
  highest_qualification?: string | null;
  institution?: string | null;
  graduation_year?: number | null;
  preferred_countries?: string[];
  preferred_roles?: string[];
  preferred_employment_types?: string[];
  preferred_work_settings?: string[];
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
  seeker?: Seeker | null;
};

export function ApplicationCard({
  id, jobTitle, snapshot, coverNote, status, employerNote, createdAt, contact, matchPercent,
  applicantId, hasResume, answers = [],
}: {
  id: string;
  jobTitle: string;
  snapshot: Record<string, unknown>;
  coverNote: string | null;
  status: string;
  employerNote: string | null;
  createdAt: string;
  contact: { email: string | null; phone: string | null } | null;
  /** Fit against this job, computed from the snapshot. Null when unscoreable. */
  matchPercent?: number | null;
  applicantId?: string;
  hasResume?: boolean;
  /** Screening answers, in the order the questions were asked. */
  answers?: { question_text: string; answer: string | null }[];
}) {
  const s = snapshot as Snapshot;
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(status);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cvPending, setCvPending] = useState(false);

  /**
   * The CV link is minted here, on click, not when the pipeline renders — a
   * presigned URL lives ten minutes, and pre-signing one per applicant on every
   * page load would expire most of them unopened.
   */
  async function openCv() {
    setCvPending(true);
    setError(null);
    const res = await settle(getApplicationResumeUrl(id));
    setCvPending(false);
    if (res.error) return setError(res.error);
    const target = res.url ?? res.href;
    if (target) window.open(target, "_blank", "noopener,noreferrer");
  }

  const verified = s.verification_status === "verified";
  const actions = NEXT_STATUS[current] ?? [];

  function move(next: string) {
    start(async () => {
      setError(null);
      const res = await settle(setApplicationStatus(id, next));
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
            {jobTitle} · applied {formatDate(createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {typeof matchPercent === "number" && (
            <span
              title="How well this applicant's job profile fits the role"
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                matchPercent >= 80
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : matchPercent >= 60
                    ? "bg-primary/5 text-primary ring-1 ring-primary/20"
                    : "bg-muted text-muted-foreground ring-1 ring-border"
              )}
            >
              <Sparkles className="h-3 w-3" aria-hidden />
              {matchPercent}% fit
            </span>
          )}
          <span
            className={cn(
              "rounded px-2 py-0.5 text-xs font-medium",
              current === "not_selected" || current === "withdrawn"
                ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-primary"
            )}
          >
            {STATUS_LABEL[current] ?? current}
          </span>
        </div>
      </div>

      {/* The CV and the profile, available from the moment they apply.
          Unlike contact details these are NOT held back until shortlisting:
          they are what the employer reads in order to decide whether to
          shortlist, and the candidate consented to exactly this when they
          applied ("your UNN profile is sent"). Withholding them made the
          pipeline unusable — an employer had a name, a fit score and no way
          to see the CV the candidate had attached. */}
      {(hasResume || applicantId) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {hasResume && (
            <Button variant="outline" size="sm" onClick={openCv} disabled={cvPending}>
              {cvPending ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Opening…</>
              ) : (
                <><FileText className="mr-1.5 h-3.5 w-3.5" /> View CV</>
              )}
            </Button>
          )}
          {applicantId && (
            <a
              href={hubLink(`/profile/${applicantId}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View profile
            </a>
          )}
        </div>
      )}

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

      {answers.length > 0 && (
        <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Screening answers
          </p>
          <dl className="space-y-2 text-sm">
            {answers.map((a, i) => (
              <div key={i}>
                <dt className="text-xs text-muted-foreground">{a.question_text}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap break-words">
                  {a.answer ?? <span className="text-muted-foreground">Not answered</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
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
          {s.seeker && <SeekerDetails seeker={s.seeker} />}
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
              variant={a.value === "not_selected" ? "outline" : "default"}
              onClick={() => move(a.value)}
              disabled={pending}
            >
              {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {a.label}
            </Button>
          ))}
          {(current === "applied" || current === "under_review") && (
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

/** The CNS job profile the applicant filled — role, experience, licensure,
 *  qualifications and preferences. Frozen in the snapshot at apply time. */
function SeekerDetails({ seeker }: { seeker: Seeker }) {
  const chips = (label: string, items?: string[]) =>
    items && items.length ? (
      <Field label={label}>
        <span className="flex flex-wrap gap-1">
          {items.map((x) => (
            <span key={x} className="rounded bg-muted px-1.5 py-0.5 text-xs">{x}</span>
          ))}
        </span>
      </Field>
    ) : null;

  const licence = [seeker.licence_type, seeker.licence_status, seeker.licence_country]
    .filter(Boolean)
    .join(" · ");
  const education = [
    seeker.highest_qualification,
    seeker.institution,
    seeker.graduation_year ? `(${seeker.graduation_year})` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const hasAny =
    seeker.nursing_role || seeker.experience_level || seeker.total_years != null ||
    (seeker.specialties?.length ?? 0) || licence || education ||
    (seeker.preferred_countries?.length ?? 0) || (seeker.preferred_roles?.length ?? 0);
  if (!hasAny) return null;

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Job profile
      </p>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {seeker.nursing_role && <Field label="Role">{seeker.nursing_role}{seeker.is_student ? " (student)" : ""}</Field>}
        {seeker.experience_level && (
          <Field label="Experience">
            {seeker.experience_level}
            {seeker.total_years != null ? ` · ${seeker.total_years} yrs` : ""}
          </Field>
        )}
        {chips("Specialties", seeker.specialties)}
        {licence && <Field label="Licensure">{licence}</Field>}
        {education && <Field label="Education">{education}</Field>}
        {chips("Open to countries", seeker.preferred_countries)}
        {chips("Open to roles", seeker.preferred_roles)}
        {chips("Employment", seeker.preferred_employment_types)}
        {chips("Settings", seeker.preferred_work_settings)}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}

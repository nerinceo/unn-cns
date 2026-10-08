"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, FileText, Loader2, ShieldCheck, ShieldAlert, Clock, Send, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  uploadEmployerDoc,
  submitForVerification,
  getEmployerDocUrl,
  updateEmployerVerificationDetails,
} from "@/lib/actions/employer-docs";
import { settle } from "@/lib/utils/settle";

export type VerificationState = {
  employerId: string;
  status: string;
  hasDocument: boolean;
  documentName: string | null;
  legalName: string | null;
  contactPerson: string | null;
  businessEmail: string | null;
  phone: string | null;
  history: { id: string; status: string; note: string | null; created_at: string }[];
};

/**
 * Employer verification (blueprint §7.2).
 *
 * A single panel rather than a wizard: there are only four fields and one file,
 * and an employer who abandons a wizard halfway leaves a record nobody can act
 * on. Everything is visible at once, and Submit states plainly what is missing.
 *
 * §15 wording constraint: this verifies the *organisation*, never a nurse's
 * professional licence. No copy here may imply otherwise.
 */
export function VerificationPanel({ state }: { state: VerificationState }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const locked = ["submitted", "under_review"].includes(state.status);
  const done = ["approved", "verified"].includes(state.status);

  function run(fn: () => Promise<{ error?: string } | { ok: boolean } | void>) {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await settle(fn());
      if (res && "error" in res && res.error) setError(res.error);
      // No result at all means the request never reached the action — e.g. the
      // platform refused an oversize upload with a 413. That showed "Saved."
      // for a file that was never stored (found 2026-10-08).
      else if (!res) setError("That did not go through. Please try again.");
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  async function openDoc() {
    const res = await settle(getEmployerDocUrl(state.employerId));
    if ("url" in res && res.url) window.open(res.url, "_blank", "noopener");
    else setError("error" in res ? res.error! : "Could not open that document.");
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Verification</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Verified organisations carry a badge on every job they post.
          </p>
        </div>
        <StatusBadge status={state.status} />
      </div>

      <fieldset disabled={locked || done || pending} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field name="legal_name" label="Registered legal name" defaultValue={state.legalName} />
        <Field name="contact_person" label="Contact person" defaultValue={state.contactPerson} required />
        <Field name="business_email" label="Business email" type="email" defaultValue={state.businessEmail} required />
        <Field name="phone" label="Phone" defaultValue={state.phone} />
      </fieldset>

      {!locked && !done && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={pending}
          onClick={() => {
            const root = input.current?.closest("section");
            const form = new FormData();
            root?.querySelectorAll<HTMLInputElement>("input[name]").forEach((el) =>
              form.append(el.name, el.value)
            );
            run(() => updateEmployerVerificationDetails(state.employerId, form));
          }}
        >
          Save details
        </Button>
      )}

      <div className="mt-5">
        <h3 className="text-sm font-medium">Registration document</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Business registration or operating licence. PDF, Word or a photo, up to 5 MB.
        </p>

        {state.hasDocument ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              {state.documentName ?? "Document uploaded"}
            </p>
            <Button variant="outline" size="sm" onClick={openDoc}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Open
            </Button>
          </div>
        ) : (
          <p className="mt-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No document uploaded yet.
          </p>
        )}

        <input
          ref={input}
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            // Checked here as well as on the server: past the platform's body
            // limit the request never reaches the server to be refused politely.
            if (f.size > 5 * 1024 * 1024) {
              setSaved(false);
              setError("Files must be under 5 MB.");
              e.target.value = "";
              return;
            }
            const form = new FormData();
            form.append("file", f);
            run(() => uploadEmployerDoc(state.employerId, form));
            e.target.value = "";
          }}
        />

        {!locked && !done && (
          <Button
            variant="outline"
            className="mt-3"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            {pending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Working…</>
            ) : (
              <><Upload className="mr-2 h-4 w-4" /> {state.hasDocument ? "Replace document" : "Choose file"}</>
            )}
          </Button>
        )}
      </div>

      {!done && (
        <div className="mt-5 border-t border-border pt-4">
          {locked ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              Submitted for review. We will let you know once a reviewer has looked at it.
            </p>
          ) : (
            <Button
              disabled={pending}
              onClick={() => run(() => submitForVerification(state.employerId))}
            >
              <Send className="mr-2 h-4 w-4" /> Submit for verification
            </Button>
          )}
        </div>
      )}

      {state.history.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-sm font-medium">History</h3>
          <ul className="mt-2 space-y-2">
            {state.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium capitalize">{h.status.replace(/_/g, " ")}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(h.created_at).toLocaleDateString()}
                </span>
                {h.note && <span className="w-full text-sm text-muted-foreground">{h.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-secondary">{error}</p>}
      {saved && !error && <p className="mt-3 text-sm text-primary">Saved.</p>}
    </section>
  );
}

function Field({
  name, label, defaultValue, type = "text", required,
}: {
  name: string; label: string; defaultValue: string | null; type?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-secondary"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
      />
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: typeof ShieldCheck; label: string; tone: string }> = {
    approved: { icon: ShieldCheck, label: "Verified", tone: "text-primary" },
    verified: { icon: ShieldCheck, label: "Verified", tone: "text-primary" },
    submitted: { icon: Clock, label: "Under review", tone: "text-muted-foreground" },
    under_review: { icon: Clock, label: "Under review", tone: "text-muted-foreground" },
    changes_requested: { icon: ShieldAlert, label: "Changes requested", tone: "text-secondary" },
    rejected: { icon: ShieldAlert, label: "Rejected", tone: "text-secondary" },
    suspended: { icon: ShieldAlert, label: "Suspended", tone: "text-secondary" },
  };
  const s = map[status] ?? { icon: ShieldAlert, label: "Not verified", tone: "text-muted-foreground" };
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${s.tone}`}>
      <Icon className="h-4 w-4" /> {s.label}
    </span>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  ScrollText,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  updateInstructorProfile,
  acceptInstructorAgreement,
  uploadInstructorDocument,
  deleteInstructorDocument,
  getInstructorDocumentUrl,
} from "@/lib/actions/lms-instructor";
import {
  LMS_EXPERTISE,
  LMS_DOC_TYPES,
  lmsDocLabel,
  missingRequiredDocs,
  MIN_INSTRUCTOR_BIO,
} from "@/lib/lms";
import type { MyInstructor } from "@/lib/cns/lms";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";
const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50";
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const btnOutline = `${btn} border border-border bg-background hover:bg-muted`;

const TABS = [
  { key: "profile", label: "Profile", icon: UserRound },
  { key: "credentials", label: "Credentials", icon: FileText },
  { key: "agreement", label: "Agreement", icon: ScrollText },
  { key: "payouts", label: "Payouts", icon: CreditCard },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function InstructorSettings({
  instructor,
  payoutsConnected,
  hubUrl,
  initialTab,
}: {
  instructor: MyInstructor;
  payoutsConnected: boolean;
  hubUrl: string;
  /** From ?tab= — how the dashboard checklist deep-links to the right section. */
  initialTab?: string;
}) {
  const [tab, setTab] = useState<TabKey>(
    TABS.some((t) => t.key === initialTab) ? (initialTab as TabKey) : "profile",
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Your teaching profile, credentials and how you get paid.
        </p>
      </header>

      {instructor.admin_note && instructor.status !== "approved" && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm font-semibold text-blue-900">Note from the Nerusalem team</p>
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-blue-800">
            {instructor.admin_note}
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
        <nav className="rounded-2xl border border-border bg-card p-1.5 lg:h-fit">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <t.icon className="h-4 w-4 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {tab === "profile" && <ProfileForm instructor={instructor} />}
          {tab === "credentials" && <Credentials instructor={instructor} />}
          {tab === "agreement" && <Agreement instructor={instructor} hubUrl={hubUrl} />}
          {tab === "payouts" && <Payouts connected={payoutsConnected} hubUrl={hubUrl} />}
        </div>
      </div>
    </div>
  );
}

// ── Profile ─────────────────────────────────────────────────────────────────

function ProfileForm({ instructor }: { instructor: MyInstructor }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [bio, setBio] = useState(instructor.bio ?? "");
  const [expertise, setExpertise] = useState<string[]>(instructor.expertise ?? []);

  function toggle(value: string) {
    setExpertise((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.delete("expertise");
    expertise.forEach((v) => formData.append("expertise", v));
    formData.set("bio", bio);

    setError(null);
    setSaved(false);
    start(async () => {
      const result = await updateInstructorProfile(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Public profile</h2>
        <p className="-mt-2 text-xs text-muted-foreground">
          This is what learners see on your course pages.
        </p>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Display name</label>
          <input
            name="display_name"
            defaultValue={instructor.display_name}
            required
            maxLength={80}
            className={field}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Headline</label>
          <input
            name="headline"
            defaultValue={instructor.headline ?? ""}
            maxLength={120}
            placeholder="NCLEX & CBT coach · 11 years ICU"
            className={field}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={6}
            className={field}
            placeholder="Where you've worked, what you teach, and why a nurse should learn it from you."
          />
          <p
            className={`mt-1 text-xs ${
              bio.trim().length >= MIN_INSTRUCTOR_BIO ? "text-emerald-600" : "text-muted-foreground"
            }`}
          >
            {bio.trim().length} / {MIN_INSTRUCTOR_BIO} characters minimum
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Areas of expertise</label>
          <div className="flex flex-wrap gap-2">
            {LMS_EXPERTISE.map((x) => {
              const on = expertise.includes(x);
              return (
                <button
                  key={x}
                  type="button"
                  onClick={() => toggle(x)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    on
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {x}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Website</label>
            <input
              name="website"
              defaultValue={instructor.website ?? ""}
              placeholder="https://"
              className={field}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Contact email</label>
            <input
              name="contact_email"
              type="email"
              defaultValue={instructor.contact_email ?? ""}
              className={field}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 className="text-sm font-semibold">Licence</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Checked against the credentials you upload. Not shown publicly.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Licence number</label>
            <input
              name="license_number"
              defaultValue={instructor.license_number ?? ""}
              className={field}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Country</label>
            <input
              name="license_country"
              defaultValue={instructor.license_country ?? ""}
              className={field}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium">Expiry</label>
            <input
              type="date"
              name="license_expiry"
              defaultValue={instructor.license_expiry?.slice(0, 10) ?? ""}
              className={field}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className={btnPrimary} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save profile
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
            <Check className="h-4 w-4" />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}

// ── Credentials ─────────────────────────────────────────────────────────────

function Credentials({ instructor }: { instructor: MyInstructor }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<string>("nursing_license");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = missingRequiredDocs(instructor.documents);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    body.set("doc_type", docType);
    const result = await uploadInstructorDocument(body);
    setBusy(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Credentials</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          A Nerusalem reviewer checks these against your licence number. They are stored privately and
          are never shown to learners.
        </p>

        {missing.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            Still needed: {missing.map(lmsDocLabel).join(", ")}
          </div>
        )}

        {instructor.documents.length > 0 && (
          <ul className="mb-4 space-y-1.5">
            {instructor.documents.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{lmsDocLabel(d.doc_type)}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {d.file_name}
                    {d.expiry_date ? ` · expires ${d.expiry_date.slice(0, 10)}` : ""}
                    {d.status ? ` · ${d.status}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <DocLink id={d.id} />
                  <button
                    type="button"
                    aria-label="Remove document"
                    onClick={async () => {
                      await deleteInstructorDocument(d.id);
                      router.refresh();
                    }}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {LMS_DOC_TYPES.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.label}
                {d.required ? " (required)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={btnOutline}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Upload
          </button>
          <span className="text-xs text-muted-foreground">PDF, Word or a photo, under 5 MB</span>
        </div>

        {error && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          onChange={onPick}
          className="hidden"
        />
      </div>
    </div>
  );
}

function DocLink({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-label="Open document"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const result = await getInstructorDocumentUrl(id);
        setBusy(false);
        if ("url" in result) window.open(result.url, "_blank", "noopener,noreferrer");
      }}
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <ExternalLink className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

// ── Agreement ───────────────────────────────────────────────────────────────

function Agreement({ instructor, hubUrl }: { instructor: MyInstructor; hubUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const accepted = !!instructor.agreement_accepted_at;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-1 text-sm font-semibold">Instructor Agreement</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        The contract that lets Nerusalem sell your course on your behalf and pay you your share. Your
        course cannot go on sale until this is accepted.
      </p>

      {accepted ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="text-sm text-emerald-900">
            <p className="font-semibold">Accepted</p>
            <p className="mt-0.5 text-xs text-emerald-800">
              {new Date(instructor.agreement_accepted_at!).toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
            <p>
              <strong className="text-foreground">You keep 95%</strong> of every sale. Nerusalem takes 5%
              to run the platform, and never discounts your course without your say-so.
            </p>
            <p>
              <strong className="text-foreground">You own your content.</strong> You grant Nerusalem a
              licence to host and sell it; you can unpublish at any time, and learners who already
              bought it keep their access.
            </p>
            <p>
              <strong className="text-foreground">You are responsible for accuracy.</strong>{" "}
              Clinical content is reviewed before it goes live, but the teaching is yours.
            </p>
            <p>
              <strong className="text-foreground">Payouts</strong> are released after the 14-day
              refund window closes, to the Stripe account you connect.
            </p>
            <a
              href={`${hubUrl}/terms`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 pt-1 font-medium text-primary hover:opacity-80"
            >
              Read the full agreement
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 rounded border-border text-primary focus:ring-primary/30"
            />
            <span className="text-sm">
              I have read and accept the Nerusalem Instructor Agreement.
            </span>
          </label>

          {error && (
            <p className="inline-flex items-center gap-1.5 text-xs text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}

          <button
            type="button"
            className={btnPrimary}
            disabled={!checked || pending}
            onClick={() =>
              start(async () => {
                const result = await acceptInstructorAgreement();
                if (result.error) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              })
            }
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Accept agreement
          </button>
        </div>
      )}
    </div>
  );
}

// ── Payouts ─────────────────────────────────────────────────────────────────

function Payouts({ connected, hubUrl }: { connected: boolean; hubUrl: string }) {
  // Stripe returns the instructor HERE when they finish, rather than dropping
  // them on UNN's own settings page with no idea how they got there.
  const returnTo =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/instructor/settings?tab=payouts`;
  const connectHref = `${hubUrl}/api/stripe/connect?return_to=${encodeURIComponent(returnTo)}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-1 text-sm font-semibold">Payouts</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Paid courses are sold on the Nerusalem marketplace and settled through Stripe. A paid course
        can&apos;t go on sale until Nerusalem can pay you. Free courses need nothing here.
      </p>

      {connected ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="text-sm text-emerald-900">
            <p className="font-semibold">Connected</p>
            <p className="mt-0.5 text-xs text-emerald-800">
              Your Stripe account can receive payouts.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <X className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Not connected</p>
            <p className="mt-0.5 text-xs text-amber-800">
              You can still build and publish free courses.
            </p>
          </div>
        </div>
      )}

      {/* Straight to Stripe. The href is a HUB *redirect route*, not a HUB
          page: HUB owns the Connect account and the secret key, so it mints the
          onboarding link and 302s onward. The hop is invisible — one click from
          here and the instructor is on Stripe. Putting the Stripe SDK in CNS
          instead would let two apps mint Connect accounts against one shared
          table, and the first duplicate account is unpickable. */}
      <a href={connectHref} className={`${btnPrimary} mt-4`}>
        <CreditCard className="h-4 w-4" />
        {connected ? "Update your Stripe details" : "Set up payments with Stripe"}
      </a>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Opens Stripe, who handle identity and bank details. Nerusalem never sees your bank
        credentials.
      </p>
    </div>
  );
}

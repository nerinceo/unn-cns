"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, FileText, Check } from "lucide-react";
import { setRegistryConsent } from "@/lib/actions/registry-consent";

/**
 * The two consent switches.
 *
 * Mirrors unn-uhn/components/registry/VisibilityToggles.tsx — same rules, same
 * copy, CNS's ActionResult shape (`{ok, error}` rather than a union). If the
 * wording changes on one side it must change on the other: a nurse and a
 * pharmacist are agreeing to the same thing, and two descriptions of one
 * setting is how a privacy promise quietly forks.
 *
 * The copy IS the consent. A toggle labelled "make my profile visible" that
 * quietly also releases a phone number is not consent, so each switch states
 * exactly what it hands over before it is flipped.
 *
 * Deliberate behaviours: turning discovery off also turns off CV sharing (here
 * and again in a database trigger); the CV switch is disabled rather than
 * hidden while discovery is off, so the dependency is visible; and both save
 * immediately, because a consent screen with an unsaved Save button is a screen
 * where someone toggles, walks away, and is wrong about their own privacy.
 */
export function VisibilityToggles({
  initialOptIn,
  initialShareResume,
  optInAt,
  hasResume,
}: {
  initialOptIn: boolean;
  initialShareResume: boolean;
  optInAt: string | null;
  hasResume: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optIn, setOptIn] = useState(initialOptIn);
  const [shareResume, setShareResume] = useState(initialShareResume);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function commit(nextOptIn: boolean, nextShare: boolean) {
    const share = nextOptIn ? nextShare : false;
    const prev = { optIn, shareResume };

    setError(null);
    setOptIn(nextOptIn);
    setShareResume(share);

    startTransition(async () => {
      const r = await setRegistryConsent(nextOptIn, share);
      if (r.error) {
        // Roll back. Leaving the switch where the user clicked would tell them
        // they are discoverable when the save was refused.
        setOptIn(prev.optIn);
        setShareResume(prev.shareResume);
        setError(r.error);
        return;
      }
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Switch
        icon={optIn ? Eye : EyeOff}
        on={optIn}
        disabled={pending}
        onChange={(next) => commit(next, shareResume)}
        title="Let hospitals find me"
        body={
          <>
            Verified hospital recruiters can find your profile in the UNN registry and see your{" "}
            <strong className="font-medium text-foreground">
              name, professional details, and your email address and phone number
            </strong>{" "}
            — even if you never apply to them. They may contact you about roles.
          </>
        }
        footnote={
          optIn && optInAt
            ? `You turned this on ${new Date(optInAt).toLocaleDateString()}.`
            : "You can turn this off at any time. Your profile disappears from the registry immediately."
        }
      />

      <Switch
        icon={FileText}
        on={shareResume}
        disabled={pending || !optIn}
        onChange={(next) => commit(optIn, next)}
        title="Let them read my CV too"
        body={
          <>
            Recruiters who find you can also open your CV, without waiting for you to apply.
            {!hasResume ? (
              <span className="mt-1 block text-amber-700">
                You have not uploaded a CV yet, so this currently shares nothing.
              </span>
            ) : null}
          </>
        }
        footnote={
          optIn
            ? "Separate from the switch above because a CV holds your full employment history."
            : "Available once you are discoverable in the registry."
        }
      />

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {pending ? (
          "Saving…"
        ) : savedAt ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            Saved at {savedAt}
          </>
        ) : (
          "Changes save as soon as you switch them."
        )}
      </p>

      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="text-sm font-medium text-foreground">What is never shared</p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>Your profile is never visible to anyone who is not a verified hospital recruiter.</li>
          <li>Applications you have made elsewhere are never shown.</li>
          <li>
            Applying to a role always shows that employer your profile and CV, whatever these
            switches say. That is what applying means.
          </li>
        </ul>
      </div>
    </div>
  );
}

/** One switch row. Kept local — nothing else in CNS needs this shape yet. */
function Switch({
  icon: Icon,
  on,
  disabled,
  onChange,
  title,
  body,
  footnote,
}: {
  icon: React.ComponentType<{ className?: string }>;
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  title: string;
  body: React.ReactNode;
  footnote?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        on ? "border-primary/30 bg-primary/[0.04]" : "border-border bg-card"
      } ${disabled && !on ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
          {footnote ? <p className="mt-2 text-xs text-muted-foreground">{footnote}</p> : null}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={title}
          disabled={disabled}
          onClick={() => onChange(!on)}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            on ? "bg-primary" : "bg-[#d4d8e0]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              on ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

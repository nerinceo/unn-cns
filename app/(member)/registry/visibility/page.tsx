import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getRegistryConsent } from "@/lib/actions/registry-consent";
import { VisibilityToggles } from "@/components/registry/VisibilityToggles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Who can see your profile — Central Nursing Systems" };

/**
 * The consent screen.
 *
 * Its own page rather than a section of the profile form, for two reasons that
 * are both about what a nurse believes afterwards: editing your qualifications
 * must never be able to change who can see them, and consent is a decision that
 * deserves a screen where the explanation is the content rather than a caption.
 */
export default async function RegistryVisibilityPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub as string | undefined;

  const [consent, resume, profile] = await Promise.all([
    getRegistryConsent(),
    uid
      ? supabase
          .from("cns_resume_files")
          .select("id")
          .eq("user_id", uid)
          .eq("is_active", true)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    uid
      ? supabase
          .from("career_profiles")
          .select("nursing_role, experience_level")
          .eq("user_id", uid)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const ready = Boolean(profile.data?.nursing_role && profile.data?.experience_level);

  return (
    <div className="space-y-6">
      <Link
        href="/registry"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Registry
      </Link>

      <header>
        <h1 className="text-2xl font-semibold">Who can see your profile</h1>
        <p className="mt-1.5 max-w-2xl text-muted-foreground">
          You are in control of this. Nothing is shared with an employer until you choose it here,
          or until you apply to one of their roles.
        </p>
      </header>

      {!ready && !consent.optIn ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            Add your nursing role and experience level before turning on discovery — those are the
            two things hospitals filter by, so without them your profile would sit in the registry
            without ever appearing in a search.
          </p>
          <Link
            href="/profile"
            className="mt-2 inline-block text-sm font-medium text-amber-900 underline underline-offset-2"
          >
            Finish your profile
          </Link>
        </div>
      ) : null}

      <VisibilityToggles
        initialOptIn={consent.optIn}
        initialShareResume={consent.shareResume}
        optInAt={consent.optInAt}
        hasResume={Boolean(resume.data)}
      />
    </div>
  );
}

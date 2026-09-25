"use server";

import type { ActionResult } from "@/lib/actions/result";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/**
 * Registry discovery consent.
 *
 * Its own module, not a field on saveSeekerProfile(), and that separation is
 * the point: editing your qualifications must never be able to change who can
 * see them. saveSeekerProfile() strips these columns for the same reason —
 * see NEVER_WRITABLE there.
 *
 * WHAT EACH SWITCH RELEASES:
 *
 *   optIn       — name, professional profile AND contact details (email and
 *                 phone) become visible to approved hospital recruiters in the
 *                 UNN registry, whether or not this member ever applies to
 *                 them. Until this is on, nothing changes: an employer sees a
 *                 nurse only when she applies, exactly as before.
 *   shareResume — additionally lets those recruiters open her CV without
 *                 waiting for an application.
 *
 * Both default to false in the database (unn-uhn/supabase/migrations/
 * 0001_uhn_registry.sql). Every nurse already on this platform filled in her
 * profile under the old deal, and stays under it until she chooses otherwise.
 */

export async function setRegistryConsent(
  optIn: boolean,
  shareResume: boolean
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  if (shareResume && !optIn) {
    return { error: "To share your CV you also need to be discoverable in the registry." };
  }

  const supabase = await createClient();

  if (optIn) {
    // A profile with no role and no experience level matches none of the
    // filters a hospital searches by, so opting it in produces a row that
    // shows up in the count, wastes their time and never converts. Nothing
    // blocks turning consent OFF — withdrawal is always immediate.
    const { data: profile } = await supabase
      .from("career_profiles")
      .select("nursing_role, experience_level")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.nursing_role) {
      return { error: "Add your nursing role before joining the registry — hospitals filter by it." };
    }
    if (!profile?.experience_level) {
      return { error: "Add your experience level before joining the registry — hospitals filter by it." };
    }
  }

  const { error } = await supabase.from("career_profiles").upsert(
    {
      user_id: user.id,
      registry_opt_in: optIn,
      // Withdrawing discovery withdraws the CV with it. A database trigger
      // enforces the same rule, so the two cannot disagree.
      registry_share_resume: optIn ? shareResume : false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { error: "Could not update your visibility. Please try again." };

  revalidatePath("/registry");
  revalidatePath("/registry/visibility");
  return { ok: true };
}

/** The current state of both switches, for rendering the toggles. */
export async function getRegistryConsent(): Promise<{
  optIn: boolean;
  shareResume: boolean;
  optInAt: string | null;
}> {
  const off = { optIn: false, shareResume: false, optInAt: null };

  const user = await getCurrentUser();
  if (!user) return off;

  const supabase = await createClient();
  const { data } = await supabase
    .from("career_profiles")
    .select("registry_opt_in, registry_opt_in_at, registry_share_resume")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return off;
  return {
    optIn: Boolean(data.registry_opt_in),
    shareResume: Boolean(data.registry_share_resume),
    optInAt: (data.registry_opt_in_at as string | null) ?? null,
  };
}

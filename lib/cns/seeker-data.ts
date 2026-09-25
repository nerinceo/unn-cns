import "server-only";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_SEEKER, type SeekerProfile } from "./seeker";

/**
 * The signed-in member's job profile, or null when signed out.
 *
 * Returns null rather than EMPTY_SEEKER for the anonymous case so callers can
 * tell "no session" from "session with an empty profile" — the job board shows
 * a sign-in prompt for the first and a complete-your-profile prompt for the
 * second, and they are not the same nudge.
 */
export async function getMySeekerProfile(): Promise<SeekerProfile | null> {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub as string | undefined;
  if (!uid) return null;

  // RLS already scopes this to the caller; the explicit eq is belt-and-braces
  // and lets the query use the primary key rather than a policy scan.
  const { data } = await supabase
    .from("career_profiles")
    .select(
      // Explicit, not "*": career_profiles carries columns this app does not
      // manage (headline, summary, consent), and spreading them into a form
      // payload risks writing back a stale copy of something HUB owns.
      "nursing_role, is_student, experience_level, total_years, specialties, licence_country, licence_type, licence_number, licence_status, highest_qualification, institution, graduation_year, preferred_countries, preferred_roles, preferred_employment_types, preferred_work_settings"
    )
    .eq("user_id", uid)
    .maybeSingle();

  return { ...EMPTY_SEEKER, ...(data ?? {}) };
}

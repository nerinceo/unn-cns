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
    .from("cns_job_seeker_profiles")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();

  return { ...EMPTY_SEEKER, ...(data ?? {}) };
}

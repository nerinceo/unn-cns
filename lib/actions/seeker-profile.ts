"use server";


import type { ActionResult } from "@/lib/actions/result";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { SeekerProfile } from "@/lib/cns/seeker";

/**
 * Columns this action may never write, whatever the caller sends.
 *
 * `patch` is spread straight into the row, and its type is erased at runtime —
 * a server action's argument is deserialized from the request, so anything can
 * appear in it regardless of what the signature says.
 *
 * That was harmless while every column here was ordinary profile data. UHN 0001
 * added registry_opt_in / registry_share_resume to this table, which are
 * CONSENT: a crafted call to "save my profile" could otherwise publish the
 * caller into the employer-facing registry and share their CV, from a form that
 * says nothing about either. Consent moves only through setRegistryConsent(),
 * next to the copy that explains what it releases.
 *
 * user_id is listed for the same reason in the other direction — it is set from
 * the session below and must not be overridable.
 */
const NEVER_WRITABLE = ["registry_opt_in", "registry_opt_in_at", "registry_share_resume", "user_id"];

export async function saveSeekerProfile(patch: Partial<SeekerProfile>): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (!NEVER_WRITABLE.includes(k)) safe[k] = v;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cns_job_seeker_profiles")
    .upsert(
      { user_id: user.id, ...safe, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { ok: true };
}

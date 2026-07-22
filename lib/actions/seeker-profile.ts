"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { SeekerProfile } from "@/lib/cns/seeker";

export async function saveSeekerProfile(patch: Partial<SeekerProfile>) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("cns_job_seeker_profiles")
    .upsert(
      { user_id: user.id, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { ok: true };
}

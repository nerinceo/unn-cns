"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { buildSeedContent, type ResumeContent } from "@/lib/cns/resume";

export async function createResume(title?: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  const supabase = await createClient();
  const content = await buildSeedContent();

  // First resume becomes the default, so "attach my CV" always has something
  // to reach for without the member having to pick one.
  const { count } = await supabase
    .from("cns_resumes")
    .select("id", { count: "exact", head: true });

  const { data, error } = await supabase
    .from("cns_resumes")
    .insert({
      user_id: user.id,
      title: title?.trim() || "My Resume",
      content,
      is_default: (count ?? 0) === 0,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/resume");
  return { id: data.id as string };
}

export async function updateResumeContent(id: string, content: ResumeContent) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("cns_resumes")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/resume/${id}`);
  return { ok: true };
}

export async function updateResumeMeta(
  id: string,
  patch: { title?: string; template?: "ats" | "designed" }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("cns_resumes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/resume/${id}`);
  revalidatePath("/resume");
  return { ok: true };
}

export async function setDefaultResume(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supabase = await createClient();

  // A partial unique index enforces one default per member, so the old one has
  // to be cleared first or the update below violates it.
  await supabase.from("cns_resumes").update({ is_default: false }).eq("user_id", user.id).eq("is_default", true);
  const { error } = await supabase.from("cns_resumes").update({ is_default: true }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/resume");
  return { ok: true };
}

export async function deleteResume(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("cns_resumes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/resume");
  return { ok: true };
}

/**
 * Toggle the public link.
 *
 * The token is 32 random hex characters, never derived from the resume id —
 * otherwise knowing one link would let someone enumerate every other. Revoking
 * sets it null, and re-sharing mints a fresh token so an old link stays dead.
 */
export async function toggleShare(id: string, share: boolean) {
  const supabase = await createClient();
  const token = share ? randomBytes(16).toString("hex") : null;
  const { error } = await supabase
    .from("cns_resumes")
    .update({ public_token: token, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/resume/${id}`);
  return { token };
}

/** Re-pull from the UNN profile, for a member who filled it in after starting. */
export async function reseedFromProfile(id: string) {
  const supabase = await createClient();
  const content = await buildSeedContent();
  const { error } = await supabase
    .from("cns_resumes")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/resume/${id}`);
  return { ok: true };
}

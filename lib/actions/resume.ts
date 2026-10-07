"use server";


import type { ActionResult } from "@/lib/actions/result";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { buildSeedContent, type ResumeContent } from "@/lib/cns/resume";
import { actionError, logError } from "@/lib/errors";
import { LIMITS, bool, hasKey, optText, reqId, reqOneOf, reqText } from "@/lib/validate";

/** cns_resumes.template CHECK constraint. */
const TEMPLATES = ["ats", "designed"] as const;
/**
 * Upper bound on a resume document, serialised. A real resume is a few KB;
 * this is a flood guard on a JSONB column, not a style limit.
 */
const MAX_CONTENT_CHARS = 200_000;
const RESUME_LISTS = [
  "registration", "experience", "education", "certifications", "skills", "specialties", "languages",
] as const;

/**
 * Shape check for the editor's autosave. The editor saves while the member is
 * still typing, so empty strings inside the document are legitimate work in
 * progress and are left alone; what is refused is anything that is not the
 * ResumeContent shape, or is implausibly large.
 */
function checkResumeContent(content: unknown): string | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) return "Resume content is not valid.";
  const c = content as Record<string, unknown>;
  const header = c.header as Record<string, unknown> | undefined;
  if (!header || typeof header !== "object" || Array.isArray(header)) return "Resume content is not valid.";
  if (header.links !== undefined && !Array.isArray(header.links)) return "Resume content is not valid.";
  for (const k of RESUME_LISTS) {
    if (c[k] !== undefined && !Array.isArray(c[k])) return "Resume content is not valid.";
  }
  if (c.summary !== undefined && c.summary !== null && typeof c.summary !== "string") return "Resume content is not valid.";
  if (c.section_order !== undefined && !Array.isArray(c.section_order)) return "Resume content is not valid.";
  let size: number;
  try {
    size = JSON.stringify(content).length;
  } catch {
    return "Resume content is not valid.";
  }
  return size > MAX_CONTENT_CHARS ? "This resume is too long to save." : null;
}

export async function createResume(title?: string): Promise<ActionResult & { id?: string }> {
  const t = optText(title, "Resume title", LIMITS.title);
  if (!t.ok) return { error: t.error };

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
      title: t.value ?? "My Resume",
      content,
      is_default: (count ?? 0) === 0,
    })
    .select("id")
    .single();

  if (error) return actionError("resume:createResume", error);
  revalidatePath("/resume");
  return { id: data.id as string };
}

export async function updateResumeContent(id: string, content: ResumeContent): Promise<ActionResult> {
  const valid = reqId(id, "Resume");
  if (!valid.ok) return { error: valid.error };
  id = valid.value;
  const bad = checkResumeContent(content);
  if (bad) return { error: bad };

  const supabase = await createClient();
  const { error } = await supabase
    .from("cns_resumes")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return actionError("resume:updateResumeContent", error);
  revalidatePath(`/resume/${id}`);
  return { ok: true };
}

export async function updateResumeMeta(
  id: string,
  patch: { title?: string; template?: "ats" | "designed" }
): Promise<ActionResult> {
  if (!patch || typeof patch !== "object") return { error: "Nothing to save." };
  const valid = reqId(id, "Resume");
  if (!valid.ok) return { error: valid.error };
  id = valid.value;
  // Only the keys supplied, as before — and only these two. Both columns are
  // NOT NULL, so a key that is sent must carry a value.
  const update: Record<string, unknown> = {};
  if (hasKey(patch, "title")) {
    const t = reqText(patch.title, "Resume title", LIMITS.title);
    if (!t.ok) return { error: t.error };
    update.title = t.value;
  }
  if (hasKey(patch, "template")) {
    const t = reqOneOf(patch.template, "Template", TEMPLATES);
    if (!t.ok) return { error: t.error };
    update.template = t.value;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cns_resumes")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return actionError("resume:updateResumeMeta", error);
  revalidatePath(`/resume/${id}`);
  revalidatePath("/resume");
  return { ok: true };
}

export async function setDefaultResume(id: string): Promise<ActionResult> {
  const valid = reqId(id, "Resume");
  if (!valid.ok) return { error: valid.error };
  id = valid.value;
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };
  const supabase = await createClient();

  // A partial unique index enforces one default per member, so the old one has
  // to be cleared first or the update below violates it.
  const { error: clearError } = await supabase
    .from("cns_resumes")
    .update({ is_default: false })
    .eq("user_id", user.id)
    .eq("is_default", true);
  if (clearError) logError("resume:setDefaultResume:clear", clearError);
  const { error } = await supabase.from("cns_resumes").update({ is_default: true }).eq("id", id);
  if (error) return actionError("resume:setDefaultResume", error);
  revalidatePath("/resume");
  return { ok: true };
}

export async function deleteResume(id: string): Promise<ActionResult> {
  const valid = reqId(id, "Resume");
  if (!valid.ok) return { error: valid.error };
  id = valid.value;
  const supabase = await createClient();
  const { error } = await supabase.from("cns_resumes").delete().eq("id", id);
  if (error) return actionError("resume:deleteResume", error);
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
export async function toggleShare(
  id: string,
  share: boolean
): Promise<ActionResult & { token?: string | null }> {
  const valid = reqId(id, "Resume");
  if (!valid.ok) return { error: valid.error };
  id = valid.value;
  share = bool(share);
  const supabase = await createClient();
  const token = share ? randomBytes(16).toString("hex") : null;
  const { error } = await supabase
    .from("cns_resumes")
    .update({ public_token: token, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return actionError("resume:toggleShare", error);
  revalidatePath(`/resume/${id}`);
  return { token };
}

/** Re-pull from the UNN profile, for a member who filled it in after starting. */
export async function reseedFromProfile(id: string): Promise<ActionResult> {
  const valid = reqId(id, "Resume");
  if (!valid.ok) return { error: valid.error };
  id = valid.value;
  const supabase = await createClient();
  const content = await buildSeedContent();
  const { error } = await supabase
    .from("cns_resumes")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return actionError("resume:reseedFromProfile", error);
  revalidatePath(`/resume/${id}`);
  return { ok: true };
}

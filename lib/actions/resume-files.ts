"use server";


import type { ActionResult } from "@/lib/actions/result";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { checkLimit } from "@/lib/ratelimit";
import {
  putDoc, deleteDoc, presignDocRead, resumeKey,
  validateUpload, RESUME_MIME, isDocsStorageConfigured,
} from "@/lib/r2/docs";

/**
 * Uploaded resumes.
 *
 * Upload goes through the server rather than a browser-to-R2 presigned PUT, so
 * type and size are validated somewhere the user cannot bypass. Files are
 * small (5 MB cap), so the round trip costs little and buys real safety.
 */

export async function uploadResume(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };
  if (!isDocsStorageConfigured()) return { error: "File uploads are not configured yet." };

  const limited = await checkLimit("upload", user.id);
  if (limited) return limited;

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file received." };

  // Read the bytes before validating: the name and declared type are supplied
  // by the client, so only the content itself is evidence of what this is.
  const bytes = Buffer.from(await file.arrayBuffer());
  const check = validateUpload(
    { name: file.name, type: file.type, size: file.size },
    RESUME_MIME,
    bytes
  );
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();
  const key = resumeKey(user.id, check.contentType);

  try {
    await putDoc(key, bytes, check.contentType);
  } catch {
    // Never surface the bucket name or key in an error a user can see.
    return { error: "Upload failed. Please try again." };
  }

  // One active upload per member (a partial unique index enforces it), so the
  // previous one is stood down first rather than colliding.
  await supabase
    .from("cns_resume_files")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("is_active", true);

  const { error } = await supabase.from("cns_resume_files").insert({
    user_id: user.id,
    storage_key: key,
    file_name: file.name,
    mime_type: check.contentType,   // the sniffed type, never the client's claim
    size_bytes: file.size,
    is_active: true,
  });

  if (error) {
    // Do not leave an orphan object paying for storage nobody can reach.
    await deleteDoc(key).catch(() => {});
    return { error: error.message };
  }

  revalidatePath("/resume");
  return { ok: true };
}

export async function deleteResumeFile(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  // RLS scopes this to the owner, so a foreign id simply reads null.
  const { data: row } = await supabase
    .from("cns_resume_files")
    .select("id,storage_key")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Not found" };

  const { error } = await supabase.from("cns_resume_files").delete().eq("id", id);
  if (error) return { error: error.message };

  // Blueprint §12.2: deleting a resume must not break historical applications.
  // cns_job_applications.resume_file_id is ON DELETE SET NULL, so the
  // application survives with its profile snapshot intact — only the file goes.
  await deleteDoc(row.storage_key as string).catch(() => {});

  revalidatePath("/resume");
  return { ok: true };
}

/**
 * A short-lived link to a resume.
 *
 * Entitlement is decided by cns_can_read_resume() in the database — owner, or
 * an employer for a job this person actually applied to. Deliberately not
 * re-implemented here: application code that forgets the second half of that
 * rule leaks every CV on the platform.
 */
export async function getResumeDownloadUrl(resumeFileId: string): Promise<ActionResult & { url?: string }> {
  const supabase = await createClient();

  const { data: allowed, error: rpcError } = await supabase.rpc("cns_can_read_resume", {
    p_resume_id: resumeFileId,
  });
  if (rpcError) return { error: rpcError.message };
  if (!allowed) return { error: "You do not have access to this file." };

  // Read the key with the service-role-free client would fail RLS for an
  // employer, so fetch it through the same definer-checked path: the row is
  // only reachable here because the RPC above already said yes.
  const admin = (await import("@/lib/supabase/admin")).createAdminClient();
  const { data: row } = await admin
    .from("cns_resume_files")
    .select("storage_key,file_name")
    .eq("id", resumeFileId)
    .maybeSingle();
  if (!row) return { error: "Not found" };

  const url = await presignDocRead(row.storage_key as string, row.file_name as string);
  return { url };
}

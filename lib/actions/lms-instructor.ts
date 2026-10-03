"use server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/result";
import { createClient } from "@/lib/supabase/server";
import {
  putDoc,
  presignDocRead,
  validateUpload,
  DOC_MIME,
  isDocsStorageConfigured,
} from "@/lib/r2/docs";
import { isLmsDocType, LMS_EXPERTISE, MIN_INSTRUCTOR_BIO } from "@/lib/lms";
import { actionError, logError } from "@/lib/errors";

/**
 * Instructor account settings — profile, credentials, agreement.
 *
 * These used to live in HUB's application form. They belong here because this
 * is where an instructor works: sending someone to another app to change their
 * own headline is the kind of split that makes a product feel unfinished.
 *
 * WHAT STAYS IN HUB, and why it is not an oversight:
 *   · APPROVAL — a reviewer checks credentials against a licence. Staff tools
 *     live with staff.
 *   · PAYOUTS — Stripe Connect onboarding is HUB's integration; it creates the
 *     account, hosts the onboarding redirect and receives the webhooks. CNS
 *     shows the status and links across rather than pretending to own it.
 *
 * ONE DELIBERATE DIFFERENCE FROM THE HUB FORM: editing a profile here does NOT
 * reset status to 'pending'. HUB's flow is an application, so every save
 * re-queues it. Once someone is approved and selling, knocking them back to
 * pending because they fixed a typo in their headline would pull their courses
 * off sale. Credentials are the thing review actually turns on, and those are
 * still reviewable.
 */

const now = () => new Date().toISOString();
const EXPERTISE = new Set<string>(LMS_EXPERTISE as readonly string[]);

async function requireInstructor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" as const, supabase: null, user: null, instructor: null };

  const { data: instructor, error: instructorError } = await supabase
    .from("lms_instructors")
    .select("id, user_id, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (instructorError) logError("lms-instructor:requireInstructor", instructorError);
  if (!instructor)
    return {
      error: "You are not registered as an instructor." as const,
      supabase: null,
      user: null,
      instructor: null,
    };

  return { error: null, supabase, user, instructor };
}

/** Save the public teaching profile. */
export async function updateInstructorProfile(formData: FormData): Promise<ActionResult> {
  const ctx = await requireInstructor();
  if (ctx.error || !ctx.supabase) return { error: ctx.error ?? "Not signed in" };

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) return { error: "A display name is required." };
  if (displayName.length > 80) return { error: "Keep your display name under 80 characters." };

  const bio = String(formData.get("bio") ?? "").trim();
  if (bio.length < MIN_INSTRUCTOR_BIO)
    return {
      error: `Please write at least ${MIN_INSTRUCTOR_BIO} characters about your teaching background.`,
    };

  // Only values from the known vocabulary — this array is rendered on public
  // course pages, so free text here would be an injection surface for content.
  const expertise = formData
    .getAll("expertise")
    .map((v) => String(v))
    .filter((v) => EXPERTISE.has(v));
  if (expertise.length === 0) return { error: "Select at least one area of expertise." };

  const { error } = await ctx.supabase
    .from("lms_instructors")
    .update({
      display_name: displayName,
      headline: String(formData.get("headline") ?? "").trim() || null,
      bio,
      expertise,
      website: String(formData.get("website") ?? "").trim() || null,
      contact_email: String(formData.get("contact_email") ?? "").trim() || null,
      license_number: String(formData.get("license_number") ?? "").trim() || null,
      license_country: String(formData.get("license_country") ?? "").trim() || null,
      license_expiry: String(formData.get("license_expiry") ?? "").trim() || null,
      updated_at: now(),
    })
    .eq("id", ctx.instructor!.id);
  if (error) return actionError("lms-instructor:updateInstructorProfile", error);

  revalidatePath("/instructor/settings");
  revalidatePath("/instructor");
  return { ok: true };
}

/**
 * Accept the Instructor Agreement.
 *
 * Stamped once and never cleared from here — it is the record that a contract
 * was agreed at a point in time, so it is append-only from the instructor's
 * side. Staff can lapse it (`agreement_lapsed_at`) if terms change.
 */
export async function acceptInstructorAgreement(): Promise<ActionResult> {
  const ctx = await requireInstructor();
  if (ctx.error || !ctx.supabase) return { error: ctx.error ?? "Not signed in" };

  const { data: existing, error: existingError } = await ctx.supabase
    .from("lms_instructors")
    .select("agreement_accepted_at")
    .eq("id", ctx.instructor!.id)
    .maybeSingle();
  if (existingError) logError("lms-instructor:acceptInstructorAgreement:read", existingError);
  if (existing?.agreement_accepted_at) return { ok: true };

  const { error } = await ctx.supabase
    .from("lms_instructors")
    .update({ agreement_accepted_at: now(), updated_at: now() })
    .eq("id", ctx.instructor!.id);
  if (error) return actionError("lms-instructor:acceptInstructorAgreement", error);

  revalidatePath("/instructor/settings");
  revalidatePath("/instructor");
  revalidatePath("/instructor/sales");
  return { ok: true };
}

/**
 * Upload a credential document.
 *
 * Server-side into the PRIVATE docs bucket — the same one resumes and employer
 * verification documents use. A nursing licence is a personal document: it is
 * never public, never on a CDN, and only ever handed back as a short-lived
 * presigned URL to the owner or to reviewing staff.
 */
export async function uploadInstructorDocument(formData: FormData): Promise<ActionResult> {
  if (!isDocsStorageConfigured()) return { error: "Document storage is not configured." };

  const ctx = await requireInstructor();
  if (ctx.error || !ctx.supabase) return { error: ctx.error ?? "Not signed in" };

  const docType = String(formData.get("doc_type") ?? "");
  if (!isLmsDocType(docType)) return { error: "Choose a document type." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a file." };

  const bytes = Buffer.from(await file.arrayBuffer());
  const checked = validateUpload(
    { name: file.name, type: file.type, size: file.size },
    DOC_MIME,
    bytes,
  );
  if (!checked.ok) return { error: checked.error };

  const key = `lms-credentials/${ctx.instructor!.id}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  await putDoc(key, bytes, checked.contentType);

  const expiry = String(formData.get("expiry_date") ?? "").trim() || null;

  const { error } = await ctx.supabase.from("lms_instructor_documents").insert({
    instructor_id: ctx.instructor!.id,
    doc_type: docType,
    file_key: key,
    file_name: file.name.slice(0, 200),
    expiry_date: expiry,
    status: "pending",
  });
  if (error) return actionError("lms-instructor:uploadInstructorDocument", error);

  revalidatePath("/instructor/settings");
  revalidatePath("/instructor");
  return { ok: true };
}

export async function deleteInstructorDocument(documentId: string): Promise<ActionResult> {
  const ctx = await requireInstructor();
  if (ctx.error || !ctx.supabase) return { error: ctx.error ?? "Not signed in" };

  // Scoped to this instructor so a crafted id cannot reach someone else's
  // licence. RLS says the same thing; this makes the refusal legible.
  const { error } = await ctx.supabase
    .from("lms_instructor_documents")
    .delete()
    .eq("id", documentId)
    .eq("instructor_id", ctx.instructor!.id);
  if (error) return actionError("lms-instructor:deleteInstructorDocument", error);

  revalidatePath("/instructor/settings");
  return { ok: true };
}

/** Short-lived link so the instructor can check what they uploaded. */
export async function getInstructorDocumentUrl(
  documentId: string,
): Promise<{ url: string } | { error: string }> {
  const ctx = await requireInstructor();
  if (ctx.error || !ctx.supabase) return { error: ctx.error ?? "Not signed in" };

  const { data: doc, error: docError } = await ctx.supabase
    .from("lms_instructor_documents")
    .select("file_key, file_name")
    .eq("id", documentId)
    .eq("instructor_id", ctx.instructor!.id)
    .maybeSingle();
  if (docError) logError("lms-instructor:getInstructorDocumentUrl", docError, { documentId });
  if (!doc) return { error: "Document not found." };

  const url = await presignDocRead(
    doc.file_key as string,
    (doc.file_name as string) ?? "document",
  );
  return { url };
}

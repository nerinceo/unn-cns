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
  MAX_UPLOAD_BYTES,
} from "@/lib/r2/docs";
import { isLmsDocType, LMS_EXPERTISE, MIN_INSTRUCTOR_BIO } from "@/lib/lms";
import { actionError, logError } from "@/lib/errors";
import { LIMITS, all, optDate, optEmail, optText, optUrl, reqId, reqText } from "@/lib/validate";
import { cleanFileName, precheckUpload } from "@/lib/actions/upload-check";

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
  if (!(formData instanceof FormData)) return { error: "A display name is required." };

  const displayName = reqText(formData.get("display_name"), "Display name", 80);
  if (!displayName.ok) {
    return {
      error: displayName.error.endsWith("is required.")
        ? "A display name is required."
        : "Keep your display name under 80 characters.",
    };
  }

  const bio = optText(formData.get("bio"), "Bio", LIMITS.bio, { multiline: true });
  if (!bio.ok) return { error: bio.error };
  if ((bio.value ?? "").length < MIN_INSTRUCTOR_BIO)
    return {
      error: `Please write at least ${MIN_INSTRUCTOR_BIO} characters about your teaching background.`,
    };

  // Only values from the known vocabulary — this array is rendered on public
  // course pages, so free text here would be an injection surface for content.
  const expertise = Array.from(
    new Set(
      formData
        .getAll("expertise")
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter((v) => EXPERTISE.has(v)),
    ),
  );
  if (expertise.length === 0) return { error: "Select at least one area of expertise." };

  const rest = all({
    headline: optText(formData.get("headline"), "Headline", LIMITS.name),
    website: optUrl(formData.get("website"), "Website"),
    contact_email: optEmail(formData.get("contact_email"), "Contact email"),
    license_number: optText(formData.get("license_number"), "Licence number", LIMITS.label),
    license_country: optText(formData.get("license_country"), "Licence country", LIMITS.label),
    license_expiry: optDate(formData.get("license_expiry"), "Licence expiry"),
  });
  if (!rest.ok) return { error: rest.error };

  const ctx = await requireInstructor();
  if (ctx.error || !ctx.supabase) return { error: ctx.error ?? "Not signed in" };

  const { error } = await ctx.supabase
    .from("lms_instructors")
    .update({
      display_name: displayName.value,
      bio: bio.value,
      expertise,
      ...rest.value,
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
  if (!(formData instanceof FormData)) return { error: "Choose a file." };

  const rawType = formData.get("doc_type");
  const docType = typeof rawType === "string" ? rawType.trim() : "";
  if (!isLmsDocType(docType)) return { error: "Choose a document type." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a file." };
  const declared = precheckUpload(file, DOC_MIME, MAX_UPLOAD_BYTES, {
    tooBig: "Files must be under 5 MB.",
    badType: "Please upload a PDF, Word document, or a photo (JPG, PNG).",
  });
  if (declared) return { error: declared };

  const expiryV = optDate(formData.get("expiry_date"), "Expiry date");
  if (!expiryV.ok) return { error: expiryV.error };

  const ctx = await requireInstructor();
  if (ctx.error || !ctx.supabase) return { error: ctx.error ?? "Not signed in" };

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

  const { error } = await ctx.supabase.from("lms_instructor_documents").insert({
    instructor_id: ctx.instructor!.id,
    doc_type: docType,
    file_key: key,
    file_name: cleanFileName(file, 200),
    expiry_date: expiryV.value,
    status: "pending",
  });
  if (error) return actionError("lms-instructor:uploadInstructorDocument", error);

  revalidatePath("/instructor/settings");
  revalidatePath("/instructor");
  return { ok: true };
}

export async function deleteInstructorDocument(documentId: string): Promise<ActionResult> {
  const id = reqId(documentId, "Document");
  if (!id.ok) return { error: id.error };
  documentId = id.value;
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
  const id = reqId(documentId, "Document");
  if (!id.ok) return { error: id.error };
  documentId = id.value;
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

"use server";


import type { ActionResult } from "@/lib/actions/result";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { checkLimit } from "@/lib/ratelimit";
import {
  putDoc, presignDocRead, employerDocKey,
  validateUpload, DOC_MIME, isDocsStorageConfigured,
} from "@/lib/r2/docs";

/**
 * Employer verification documents (blueprint §7.1, §9.1).
 *
 * Business registration or licence documents. Same private bucket as resumes,
 * same rule: keys never reach a client, reads are short-lived presigned URLs.
 * Images are accepted as well as PDFs here because registrations are often
 * photographed rather than scanned.
 */

export async function uploadEmployerDoc(employerId: string, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };
  if (!isDocsStorageConfigured()) return { error: "File uploads are not configured yet." };

  const limited = await checkLimit("upload", user.id);
  if (limited) return limited;

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file received." };

  const check = validateUpload({ name: file.name, type: file.type, size: file.size }, DOC_MIME);
  if (!check.ok) return { error: check.error };

  const supabase = await createClient();

  // Membership is the gate. RLS on cns_employers already restricts this read
  // to members and staff, so a non-member simply gets null.
  const { data: employer } = await supabase
    .from("cns_employers")
    .select("id,registration_doc_key")
    .eq("id", employerId)
    .maybeSingle();
  if (!employer) return { error: "Not permitted." };

  const key = employerDocKey(employerId, file.name);
  try {
    await putDoc(key, Buffer.from(await file.arrayBuffer()), file.type);
  } catch {
    return { error: "Upload failed. Please try again." };
  }

  const { error } = await supabase
    .from("cns_employers")
    .update({ registration_doc_key: key, updated_at: new Date().toISOString() })
    .eq("id", employerId);
  if (error) return { error: error.message };

  revalidatePath(`/employer/${employerId}/settings`);
  return { ok: true };
}

/**
 * The contact details verification depends on (§7.1).
 *
 * Kept separate from the public-facing organisation profile: these are the
 * fields a reviewer checks the registration document against, so an edit while
 * a submission is under review would undermine the review itself.
 */
export async function updateEmployerVerificationDetails(
  employerId: string,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: employer } = await supabase
    .from("cns_employers")
    .select("id,verification_status")
    .eq("id", employerId)
    .maybeSingle();
  if (!employer) return { error: "Not permitted." };

  if (["submitted", "under_review"].includes(employer.verification_status as string)) {
    return { error: "Details are locked while your submission is being reviewed." };
  }

  const text = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const business_email = text("business_email");
  if (business_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(business_email)) {
    return { error: "That business email does not look right." };
  }

  const { error } = await supabase
    .from("cns_employers")
    .update({
      legal_name: text("legal_name"),
      contact_person: text("contact_person"),
      business_email,
      phone: text("phone"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", employerId);
  if (error) return { error: error.message };

  revalidatePath(`/employer/${employerId}/settings`);
  return { ok: true };
}

/**
 * Submit the organisation for verification (§7.2).
 *
 * Records a row in the history table so §9.1's "maintain verification history"
 * holds — a status column alone loses every previous decision.
 */
export async function submitForVerification(employerId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: employer } = await supabase
    .from("cns_employers")
    .select("id,name,registration_doc_key,contact_person,business_email,website,verification_status")
    .eq("id", employerId)
    .maybeSingle();
  if (!employer) return { error: "Not permitted." };

  const current = employer.verification_status as string;
  if (["submitted", "under_review"].includes(current)) {
    return { error: "Already submitted — a reviewer is looking at it." };
  }
  if (["approved", "verified"].includes(current)) {
    return { error: "This organisation is already verified." };
  }

  const missing: string[] = [];
  if (!employer.registration_doc_key) missing.push("a registration document");
  if (!employer.contact_person) missing.push("a contact person");
  if (!employer.business_email) missing.push("a business email");
  if (missing.length) return { error: `Add ${missing.join(", ")} before submitting.` };

  const { error } = await supabase
    .from("cns_employers")
    .update({ verification_status: "submitted", updated_at: new Date().toISOString() })
    .eq("id", employerId);
  if (error) return { error: error.message };

  await supabase.from("cns_employer_verifications").insert({
    employer_id: employerId,
    status: "submitted",
    document_keys: [employer.registration_doc_key],
  });

  revalidatePath(`/employer/${employerId}/settings`);
  revalidatePath("/admin/employers");
  return { ok: true };
}

/** A short-lived link to a verification document — RLS scopes it to the
 *  organisation's own members and to staff; anyone else reads null. */
export async function getEmployerDocUrl(employerId: string): Promise<ActionResult & { url?: string }> {
  const supabase = await createClient();

  // RLS restricts this row to members and staff; anyone else reads null.
  const { data } = await supabase
    .from("cns_employers")
    .select("registration_doc_key")
    .eq("id", employerId)
    .maybeSingle();
  if (!data?.registration_doc_key) return { error: "No document uploaded." };

  const url = await presignDocRead(data.registration_doc_key as string);
  return { url };
}

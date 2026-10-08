"use server";


import type { ActionResult } from "@/lib/actions/result";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { checkLimit } from "@/lib/ratelimit";
import { canReadEmployerDoc, readEmployerDocKey } from "@/lib/cns/employer-doc-access";
import { getEmployerPrivate } from "@/lib/cns/employer-private";
import { actionError, logError } from "@/lib/errors";
import {
  putDoc, presignDocRead, employerDocKey,
  validateUpload, DOC_MIME, isDocsStorageConfigured, MAX_UPLOAD_BYTES,
} from "@/lib/r2/docs";
import { LIMITS, all, optText, reqEmail, reqId, reqText } from "@/lib/validate";
import { precheckUpload } from "@/lib/actions/upload-check";

const DOC_UPLOAD_MESSAGES = {
  tooBig: "Files must be under 5 MB.",
  badType: "Please upload a PDF, Word document, or a photo (JPG, PNG).",
};

/**
 * Employer verification documents (blueprint §7.1, §9.1).
 *
 * Business registration or licence documents. Same private bucket as resumes,
 * same rule: keys never reach a client, reads are short-lived presigned URLs.
 * Images are accepted as well as PDFs here because registrations are often
 * photographed rather than scanned.
 */

export async function uploadEmployerDoc(employerId: string, formData: FormData): Promise<ActionResult> {
  const id = reqId(employerId, "Employer");
  if (!id.ok) return { error: id.error };
  employerId = id.value;
  const file = formData instanceof FormData ? formData.get("file") : null;
  if (!(file instanceof File)) return { error: "No file received." };
  const declared = precheckUpload(file, DOC_MIME, MAX_UPLOAD_BYTES, DOC_UPLOAD_MESSAGES);
  if (declared) return { error: declared };

  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };
  if (!isDocsStorageConfigured()) return { error: "File uploads are not configured yet." };

  const limited = await checkLimit("upload", user.id);
  if (limited) return limited;

  // Read the bytes before validating — see the note in resume-files.ts.
  const bytes = Buffer.from(await file.arrayBuffer());
  const check = validateUpload(
    { name: file.name, type: file.type, size: file.size },
    DOC_MIME,
    bytes
  );
  if (!check.ok) return { error: check.error };

  // Membership is the gate, and it must be checked explicitly. Reading the
  // employer row is NOT a membership test: RLS publishes every approved
  // organisation to every signed-in user. Relying on it here let a non-member
  // write objects into the bucket and still receive {ok:true}, because the
  // UPDATE below simply matches zero rows rather than erroring.
  if (!(await canReadEmployerDoc(employerId))) return { error: "Not permitted." };

  const supabase = await createClient();
  const key = employerDocKey(employerId, check.contentType);
  try {
    await putDoc(key, bytes, check.contentType);
  } catch (err) {
    logError("employer-docs:uploadEmployerDoc:put", err, { employerId });
    return { error: "Upload failed. Please try again." };
  }

  const { error } = await supabase
    .from("cns_employers")
    .update({ registration_doc_key: key, updated_at: new Date().toISOString() })
    .eq("id", employerId);
  if (error) return actionError("employer-docs:uploadEmployerDoc", error, undefined, { employerId });

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
  const id = reqId(employerId, "Employer");
  if (!id.ok) return { error: id.error };
  employerId = id.value;
  if (!(formData instanceof FormData)) return { error: "Nothing to save." };
  // Contact person and business email are marked required on the form and a
  // blank save used to report "Saved." (found 2026-10-08) — so they are
  // required here too, per the no-empty-values rule. Blank optional → null.
  const v = all({
    legal_name: optText(formData.get("legal_name"), "Registered legal name", LIMITS.name),
    contact_person: reqText(formData.get("contact_person"), "Contact person", LIMITS.name),
    business_email: reqEmail(formData.get("business_email"), "Business email"),
    phone: optText(formData.get("phone"), "Phone", LIMITS.phone),
  });
  if (!v.ok) {
    return {
      error: /email/i.test(v.error) && !/required/i.test(v.error) ? "That business email does not look right." : v.error,
    };
  }

  // Explicit membership check — see the note in uploadEmployerDoc.
  if (!(await canReadEmployerDoc(employerId))) return { error: "Not permitted." };

  const supabase = await createClient();

  const { data: employer, error: employerError } = await supabase
    .from("cns_employers")
    .select("id,verification_status")
    .eq("id", employerId)
    .maybeSingle();
  if (employerError) {
    logError("employer-docs:updateEmployerVerificationDetails:read", employerError, { employerId });
  }
  if (!employer) return { error: "Not permitted." };

  if (["submitted", "under_review"].includes(employer.verification_status as string)) {
    return { error: "Details are locked while your submission is being reviewed." };
  }

  const { error } = await supabase
    .from("cns_employers")
    .update({
      ...v.value,
      updated_at: new Date().toISOString(),
    })
    .eq("id", employerId);
  if (error) return actionError("employer-docs:updateEmployerVerificationDetails", error, undefined, { employerId });

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
  const id = reqId(employerId, "Employer");
  if (!id.ok) return { error: id.error };
  employerId = id.value;
  // Explicit membership check — see the note in uploadEmployerDoc.
  if (!(await canReadEmployerDoc(employerId))) return { error: "Not permitted." };

  const supabase = await createClient();

  const { data: publicRow, error: publicError } = await supabase
    .from("cns_employers")
    .select("id,name,website,verification_status")
    .eq("id", employerId)
    .maybeSingle();
  if (publicError) logError("employer-docs:submitForVerification:read", publicError, { employerId });
  if (!publicRow) return { error: "Not permitted." };
  // Contact fields are private now (E-B-001) — read through the entitled path.
  const priv = await getEmployerPrivate(employerId);
  const employer = {
    ...publicRow,
    contact_person: priv?.contact_person ?? null,
    business_email: priv?.business_email ?? null,
  };

  // The key is service-role only now, so it is fetched through the one path
  // that checks entitlement rather than selected alongside the public columns.
  const docKey = await readEmployerDocKey(employerId);

  const current = employer.verification_status as string;
  if (["submitted", "under_review"].includes(current)) {
    return { error: "Already submitted — a reviewer is looking at it." };
  }
  if (["approved", "verified"].includes(current)) {
    return { error: "This organisation is already verified." };
  }

  const missing: string[] = [];
  if (!docKey) missing.push("a registration document");
  if (!employer.contact_person) missing.push("a contact person");
  if (!employer.business_email) missing.push("a business email");
  if (missing.length) return { error: `Add ${missing.join(", ")} before submitting.` };

  const { error } = await supabase
    .from("cns_employers")
    .update({ verification_status: "submitted", updated_at: new Date().toISOString() })
    .eq("id", employerId);
  if (error) return actionError("employer-docs:submitForVerification", error, undefined, { employerId });

  const { error: historyError } = await supabase.from("cns_employer_verifications").insert({
    employer_id: employerId,
    status: "submitted",
    document_keys: [docKey],
  });
  if (historyError) logError("employer-docs:submitForVerification:history", historyError, { employerId });

  revalidatePath(`/employer/${employerId}/settings`);
  revalidatePath("/admin/employers");
  return { ok: true };
}

/**
 * A short-lived link to a verification document.
 *
 * Entitlement is decided by cns_can_read_employer_doc() in the database, not
 * here. The earlier version of this function read the key with the user's own
 * client and trusted RLS to filter it — but RLS on cns_employers deliberately
 * lets any signed-in user read an organisation's public profile, so it handed
 * every business registration document to anyone who asked. Verified against
 * production with a second employer account before it was fixed.
 */
export async function getEmployerDocUrl(employerId: string): Promise<ActionResult & { url?: string }> {
  const id = reqId(employerId, "Employer");
  if (!id.ok) return { error: id.error };
  employerId = id.value;
  if (!(await canReadEmployerDoc(employerId))) {
    return { error: "You do not have access to this document." };
  }

  const key = await readEmployerDocKey(employerId);
  if (!key) return { error: "No document uploaded." };

  return { url: await presignDocRead(key) };
}

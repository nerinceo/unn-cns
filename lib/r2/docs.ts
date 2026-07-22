import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Private document storage — resumes and employer verification documents.
 *
 * A SEPARATE bucket from the public media one. These are personal documents:
 * a CV carries a nurse's employment history, a verification document carries a
 * business registration. Nothing here is ever served from a public URL, and
 * the object key never reaches a client.
 *
 * Modelled on HUB's lib/r2/digital.ts, which does the same for paid downloads.
 *
 * The bucket must have NO public access and NO custom domain. If it is ever
 * made public, every resume on the platform is world-readable — the code
 * below cannot protect against that.
 */

const ACCOUNT = process.env.R2_ACCOUNT_ID;
const KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET = process.env.R2_SECRET_ACCESS_KEY;
export const DOCS_BUCKET = process.env.R2_DOCS_BUCKET;

export function isDocsStorageConfigured() {
  return Boolean(ACCOUNT && KEY && SECRET && DOCS_BUCKET);
}

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!isDocsStorageConfigured()) {
    throw new Error("Private document storage is not configured (R2_DOCS_BUCKET).");
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: KEY!, secretAccessKey: SECRET! },
  });
  return client;
}

/** Accepted resume formats. DOCX first — it parses most reliably in ATS. */
export const RESUME_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);
export const DOC_MIME = new Set(
  Array.from(RESUME_MIME).concat(["image/jpeg", "image/png", "image/webp"])
);
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Server-side validation of an upload.
 *
 * Extension AND mime are both checked: a browser will happily report
 * application/pdf for a renamed executable, and §15 requires refusing
 * executables outright. Size is capped before anything reaches R2.
 */
export function validateUpload(
  file: { name: string; type: string; size: number },
  allowed: Set<string>
): { ok: true } | { ok: false; error: string } {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const banned = ["exe", "bat", "cmd", "sh", "js", "jar", "msi", "com", "scr", "ps1", "app"];
  if (banned.includes(ext)) return { ok: false, error: "That file type is not allowed." };
  if (!allowed.has(file.type)) return { ok: false, error: "Please upload a PDF or Word document." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Files must be under 5 MB." };
  if (file.size === 0) return { ok: false, error: "That file appears to be empty." };
  return { ok: true };
}

/** Key layout keeps every user's documents under their own prefix. */
export function resumeKey(userId: string, fileName: string) {
  const ext = fileName.toLowerCase().split(".").pop() ?? "pdf";
  return `resumes/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

export function employerDocKey(employerId: string, fileName: string) {
  const ext = fileName.toLowerCase().split(".").pop() ?? "pdf";
  return `employer-docs/${employerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

export async function putDoc(key: string, body: Buffer, contentType: string) {
  await getClient().send(
    new PutObjectCommand({ Bucket: DOCS_BUCKET, Key: key, Body: body, ContentType: contentType })
  );
  return key;
}

/**
 * Short-lived read URL.
 *
 * Ten minutes: long enough to open or download, short enough that a link
 * pasted into a chat is useless by the time anyone else clicks it. Callers
 * MUST have already established the reader is entitled — see
 * cns_can_read_resume() in the database.
 */
export async function presignDocRead(key: string, fileName?: string, expiresIn = 600) {
  const cmd = new GetObjectCommand({
    Bucket: DOCS_BUCKET,
    Key: key,
    ...(fileName
      ? { ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"` }
      : {}),
  });
  return getSignedUrl(getClient(), cmd, { expiresIn });
}

export async function deleteDoc(key: string) {
  await getClient().send(new DeleteObjectCommand({ Bucket: DOCS_BUCKET, Key: key }));
}

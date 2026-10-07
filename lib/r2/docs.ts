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
 * What a file actually is, judged by its leading bytes.
 *
 * The filename and the browser-reported MIME type are both chosen by whoever
 * is uploading, so neither is evidence. Renaming a Windows executable to
 * `cv.pdf` makes a browser report `application/pdf`, and a checker that trusts
 * that will store and later serve the executable — verified against production
 * before this function existed.
 *
 * Returns null when the bytes match nothing we accept, which is the only safe
 * default: an unrecognised header means we cannot say it is harmless.
 */
export function sniffContentType(bytes: Buffer): string | null {
  const starts = (...sig: number[]) =>
    sig.every((b, i) => bytes[i] === b);

  if (starts(0x25, 0x50, 0x44, 0x46)) return "application/pdf";           // %PDF
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes.subarray(8, 12).toString("latin1") === "WEBP")
    return "image/webp";
  if (starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return "application/msword"; // OLE2

  // DOCX is a zip. So is a jar and so is an unpacked installer, so the zip
  // header alone is not enough — require the WORD document part. Every Office
  // format (xlsx, pptx, xlsm…) carries [Content_Types].xml, so that marker
  // alone let spreadsheets and macro files in as "résumés" (QA 2026-10-07).
  // File names live in each entry's header AND in the central directory at the
  // end of the zip, so the first and last 64 KB are enough to see them.
  if (starts(0x50, 0x4b, 0x03, 0x04)) {
    const W = 64 * 1024;
    const names =
      bytes.subarray(0, W).toString("latin1") +
      (bytes.length > W ? bytes.subarray(Math.max(W, bytes.length - W)).toString("latin1") : "");
    if (names.includes("word/document.xml") && !names.includes("xl/workbook") && !names.includes("ppt/presentation")) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    return null;
  }
  return null;
}

/**
 * Server-side validation of an upload.
 *
 * The decision rests on `bytes`, never on the name or the declared type. Size
 * is capped before anything reaches R2. Callers must store the returned
 * `contentType` rather than the client's, so R2 cannot be made to serve an
 * attacker-chosen type back to a reviewer.
 */
export function validateUpload(
  file: { name: string; type: string; size: number },
  allowed: Set<string>,
  bytes: Buffer
): { ok: true; contentType: string } | { ok: false; error: string } {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Files must be under 5 MB." };
  if (file.size === 0 || bytes.length === 0) {
    return { ok: false, error: "That file appears to be empty." };
  }

  const actual = sniffContentType(bytes);
  if (!actual || !allowed.has(actual)) {
    return {
      ok: false,
      error: allowed.has("image/png")
        ? "Please upload a PDF, Word document, or a photo (JPG, PNG)."
        : "Please upload a PDF or Word document.",
    };
  }
  return { ok: true, contentType: actual };
}

/**
 * Key layout keeps every user's documents under their own prefix.
 *
 * The extension is derived from the sniffed type, not the uploaded filename,
 * so the key cannot be made to disagree with the bytes it points at.
 */
const EXT_FOR: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const rand = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function resumeKey(userId: string, contentType: string) {
  return `resumes/${userId}/${rand()}.${(Object.prototype.hasOwnProperty.call(EXT_FOR, contentType) ? EXT_FOR[contentType] : "bin")}`;
}

export function employerDocKey(employerId: string, contentType: string) {
  return `employer-docs/${employerId}/${rand()}.${(Object.prototype.hasOwnProperty.call(EXT_FOR, contentType) ? EXT_FOR[contentType] : "bin")}`;
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
    // Strip quotes, control characters and path separators: the filename is
    // user-supplied and goes straight into a response header.
    ...(fileName
      ? {
          ResponseContentDisposition: `attachment; filename="${fileName
            .replace(/[\r\n"\\/]/g, "")
            .replace(/[\x00-\x1f\x7f]/g, "")
            .slice(0, 120)}"`,
        }
      : {}),
  });
  return getSignedUrl(getClient(), cmd, { expiresIn });
}

export async function deleteDoc(key: string) {
  await getClient().send(new DeleteObjectCommand({ Bucket: DOCS_BUCKET, Key: key }));
}

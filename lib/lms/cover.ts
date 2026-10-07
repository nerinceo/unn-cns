import "server-only";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * Course cover images — the ONLY publicly-served objects CNS writes.
 *
 * Everything else CNS stores (resumes, employer documents, lecture video) is
 * private and reached through a presigned GET. A cover is different: it is
 * rendered on the UNN marketplace card by a buyer who has not purchased
 * anything and may not even be signed in, so it has to sit on the public bucket
 * behind the media domain.
 *
 * That is the same bucket HUB uses for post and listing media — R2_BUCKET /
 * R2_PUBLIC_URL — not a new one. One public bucket, one custom domain, one CORS
 * policy to keep correct.
 *
 * Upload goes through the SERVER rather than a presigned browser PUT. A cover is
 * a small image, so it fits comfortably inside a server action's body limit,
 * and the server path needs no bucket CORS at all — one less thing to configure
 * and one less silent browser-side failure.
 */

const ACCOUNT = process.env.R2_ACCOUNT_ID;
const KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET;
const PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");

export function isCoverStorageConfigured(): boolean {
  return Boolean(ACCOUNT && KEY && SECRET && BUCKET && PUBLIC_URL);
}

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!isCoverStorageConfigured()) {
    throw new Error("Public media storage is not configured (R2_BUCKET / R2_PUBLIC_URL).");
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: KEY!, secretAccessKey: SECRET! },
  });
  return client;
}

/** 5 MB. A storefront image larger than this is a mistake, not a requirement. */
export const COVER_MAX_BYTES = 5 * 1024 * 1024;

const COVER_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isAllowedCoverType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(COVER_MIME, type); // not `in`: "constructor" would pass the allow-list
}

/**
 * Upload a cover and return its public URL.
 *
 * The extension comes from the sniffed content type the caller validated, not
 * from the uploaded filename, so the key can never disagree with its bytes.
 */
export async function putCover(
  courseId: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const ext = COVER_MIME[contentType] ?? "bin";
  const key = `lms-cover/${courseId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET!,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      // Covers are content-addressed by the random key, so they never change
      // under a given URL and can be cached hard.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return `${PUBLIC_URL}/${key}`;
}

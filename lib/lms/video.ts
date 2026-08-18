import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Lecture video storage.
 *
 * WHY AN INTERFACE INSTEAD OF JUST CALLING CLOUDFLARE STREAM
 * ----------------------------------------------------------
 * Cloudflare Stream remains the right destination — free encoding, HLS, signed
 * playback, same vendor as R2. But it is not provisioned, and a course builder
 * that cannot accept a video is not a course builder. So playback runs on a
 * PRIVATE R2 bucket behind the same discipline lib/r2/docs.ts uses for resumes:
 * the object is never public, and a short-TTL presigned GET is minted only
 * after the caller's entitlement has been checked server-side.
 *
 * Every call site goes through `videoProvider()`, and `video_provider` is
 * stored per lecture, so the day Stream is configured new uploads switch to it
 * while existing R2 lectures keep playing.
 *
 * TWO DIFFERENCES FROM lib/r2/docs.ts, both forced by size:
 *   1. Upload is a presigned browser PUT, not putDoc(). A 2 GB video cannot go
 *      through a server action — the request body limit is a few MB.
 *   2. That means the bucket needs CORS allowing PUT from this app's origin.
 *      Without it the browser blocks the request before it leaves, and the
 *      failure is invisible server-side. See the CORS note in the builder's
 *      upload component.
 *
 * What the R2 path gives up, stated plainly: no transcoding, so the learner
 * streams the instructor's source file at its original bitrate; no adaptive
 * quality ladder; no auto-captions. Acceptable at launch with a size cap, and
 * the reason the cap below is deliberately conservative.
 */

const ACCOUNT = process.env.R2_ACCOUNT_ID;
const KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET = process.env.R2_SECRET_ACCESS_KEY;

/** Falls back to the docs bucket so a single private bucket also works. */
export const VIDEO_BUCKET = process.env.R2_VIDEO_BUCKET || process.env.R2_DOCS_BUCKET;

export function isVideoStorageConfigured(): boolean {
  return Boolean(ACCOUNT && KEY && SECRET && VIDEO_BUCKET);
}

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!isVideoStorageConfigured()) {
    throw new Error("Video storage is not configured (R2_VIDEO_BUCKET).");
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: KEY!, secretAccessKey: SECRET! },
  });
  return client;
}

export type VideoProvider = "r2" | "stream";

/** True once Cloudflare Stream is fully configured. Checked, never assumed. */
export function isStreamConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_STREAM_TOKEN);
}

/** Which provider new uploads should use right now. */
export function videoProvider(): VideoProvider {
  return isStreamConfigured() ? "stream" : "r2";
}

// ── Upload rules ─────────────────────────────────────────────────────────────
// 2 GB matches what a single-PUT presigned upload handles comfortably and keeps
// an untranscoded lecture from becoming an unwatchable download for a learner
// on a phone in Lagos or Manila — who is, by the product plan, the target user.
export const VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;

const VIDEO_TYPES = new Set<string>([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

export function isAllowedVideoType(type: string): boolean {
  return VIDEO_TYPES.has(type);
}

export const VIDEO_TYPE_HINT = "MP4, MOV or WebM";

function safeExt(fileName: string): string {
  const raw = fileName.split(".").pop()?.toLowerCase() ?? "mp4";
  const cleaned = raw.replace(/[^a-z0-9]/g, "");
  return cleaned.length > 0 && cleaned.length <= 8 ? cleaned : "mp4";
}

/**
 * Private object key for a lecture video. Namespaced by course so deleting a
 * course leaves one prefix to sweep, and prefixed `lms-video/` so these are
 * trivially distinguishable from resumes and employer documents in the bucket.
 */
export function makeVideoKey(courseId: string, fileName: string): string {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `lms-video/${courseId}/${stamp}.${safeExt(fileName)}`;
}

/** Presigned PUT (30 min — videos are large and connections are not). */
export async function presignVideoUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    getClient(),
    new PutObjectCommand({ Bucket: VIDEO_BUCKET!, Key: key, ContentType: contentType }),
    { expiresIn: 1800 },
  );
}

/**
 * Presigned GET for playback (2 hours).
 *
 * The TTL is the security/UX trade-off: too short and a long lecture dies
 * mid-watch when the learner pauses for lunch; too long and a leaked URL is
 * useful to a stranger. Two hours matches the Stream token TTL, so switching
 * providers changes nothing about the exposure window.
 *
 * This is not DRM and does not pretend to be — a determined learner can save
 * the file. It stops casual URL sharing and unentitled access, which is the
 * realistic threat.
 */
export async function presignVideoPlayback(key: string): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: VIDEO_BUCKET!,
      Key: key,
      ResponseContentDisposition: "inline",
    }),
    { expiresIn: 7200 },
  );
}

/** Best-effort removal of a replaced or deleted lecture video. */
export async function deleteVideoObject(key: string): Promise<void> {
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: VIDEO_BUCKET!, Key: key }));
  } catch {
    // An orphaned object costs storage but breaks nothing — never fail the
    // user's action over it.
  }
}

/**
 * Playback URL for a lecture, whichever provider holds it.
 * Returns null when the lecture has no playable video yet.
 *
 * CALLERS MUST HAVE ALREADY CHECKED ENTITLEMENT. This function deliberately
 * takes no user context so it can never be mistaken for the access gate.
 */
export async function playbackUrlFor(lecture: {
  video_provider?: string | null;
  video_key?: string | null;
  video_uid?: string | null;
  video_status?: string | null;
}): Promise<string | null> {
  if (lecture.video_status !== "ready") return null;

  if (lecture.video_provider === "stream" && lecture.video_uid) {
    // Signed Stream playback lands with the Stream rollout; until the signing
    // key exists there is nothing honest to return here.
    return null;
  }
  if (lecture.video_key) return presignVideoPlayback(lecture.video_key);
  return null;
}

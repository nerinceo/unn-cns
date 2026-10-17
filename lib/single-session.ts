// One signed-in device per account (Naveen, 2026-10-17 — no ID sharing).
//
// MIRRORED byte-for-byte in HUB, CNS and UHN (they share one session cookie,
// so the rule must hold in every app). Edge-safe: plain fetch to Upstash REST
// and to the Supabase RPC, no SDKs, so it runs inside middleware.
//
// The NEWEST auth session is the account's only valid one (migration 0091,
// public.single_session_latest — NULL for platform staff, who are exempt).
// Middleware asks isSupersededSession() on every request; a session that is no
// longer the newest is revoked there and the visitor sent to sign in.
//
// Cached per user in Redis for 60 s. A cached value can be stale, so a
// MISMATCH is always re-checked against the database before anyone is signed
// out — a stale cache can delay kicking the old device, never kick the new one.
// Sign-in routes call noteNewSession() so the old device goes on its very next
// request rather than within the minute.
//
// Fails OPEN: if Redis or the database can't be reached, nobody is signed out.

const KEY = (userId: string) => `sess:latest:v1:${userId}`;
const TTL_SEC = 60;
const TIMEOUT_MS = 800;
const EXEMPT = "exempt";

const redisUrl = () => process.env.UPSTASH_REDIS_REST_URL;
const redisToken = () => process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command: (string | number)[]): Promise<unknown> {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) return null;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return ((await res.json()) as { result?: unknown }).result ?? null;
}

/** Newest session id for the user, or EXEMPT (staff / no session). Throws on failure. */
async function latestFromDb(userId: string): Promise<string> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("single-session: missing Supabase env");
  const res = await fetch(`${base}/rest/v1/rpc/single_session_latest`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_user: userId }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`single_session_latest ${res.status}`);
  const id = (await res.json()) as string | null;
  return id || EXEMPT;
}

/**
 * True only when the database confirms that `sessionId` is not the account's
 * newest session (and the account isn't exempt). Never throws.
 */
export async function isSupersededSession(userId: unknown, sessionId: unknown): Promise<boolean> {
  if (typeof userId !== "string" || typeof sessionId !== "string" || !userId || !sessionId) return false;
  try {
    const cached = await redis(["GET", KEY(userId)]).catch(() => null);
    if (cached === sessionId || cached === EXEMPT) return false;
    // Miss or mismatch: the database decides.
    const latest = await latestFromDb(userId);
    await redis(["SET", KEY(userId), latest, "EX", TTL_SEC]).catch(() => null);
    return latest !== EXEMPT && latest !== sessionId;
  } catch (err) {
    console.error("[single-session] check failed, allowing the request:", err);
    return false;
  }
}

/** Call after a sign-in creates a session: drops the cache so the old device goes at once. Never throws. */
export async function noteNewSession(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  await redis(["DEL", KEY(userId)]).catch((err) => console.error("[single-session] note failed:", err));
}

/** Paths that must never be interrupted (they create or end sessions). */
export function isSessionExemptPath(path: string): boolean {
  return path.startsWith("/auth/") || path.startsWith("/api/auth/") || path === "/logout";
}

/** Shown on the sign-in page (and returned to API callers) after the kick. */
export const SIGNED_IN_ELSEWHERE_MESSAGE =
  "You were signed out because your account was signed in on another device. Each account can be signed in on one device at a time.";

import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Abuse limits (blueprint §9.3: "rate-limit repeated applications, postings
 * and reports").
 *
 * SHARES HUB's Redis instance, so every key is namespaced `cns:`. Without that
 * prefix a CNS limiter could collide with a HUB cache key and evict it — the
 * two apps are separate deployments but this is one database.
 *
 * FAILS OPEN. If Redis is unreachable the action is allowed and the failure is
 * logged. That is the deliberate trade: a rate limiter is an abuse control, not
 * an authorisation boundary, and letting a Redis outage take down job
 * applications would cause more harm than the abuse it prevents. Every limited
 * action is separately protected by RLS and its own validation.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (!url || !token) return null;
  // Bounded, same as HUB's lib/redis.ts: SDK defaults (5 retries, no fetch
  // timeout) turned a slow Upstash into seconds of stall on every limited
  // action. Limit checks fail open, so a fast failure means "allow".
  redis ??= new Redis({
    url,
    token,
    retry: { retries: 1, backoff: () => 50 },
    signal: () => AbortSignal.timeout(1000),
  });
  return redis;
}

const limiters = new Map<string, Ratelimit>();

function limiter(name: string, tokens: number, window: `${number} ${"s" | "m" | "h" | "d"}`) {
  const r = getRedis();
  if (!r) return null;
  if (!limiters.has(name)) {
    limiters.set(
      name,
      new Ratelimit({
        redis: r,
        // Sliding window rather than fixed: a fixed window lets someone send
        // a full quota at 11:59 and another at 12:00.
        limiter: Ratelimit.slidingWindow(tokens, window),
        prefix: `cns:rl:${name}`,
        analytics: false,
      })
    );
  }
  return limiters.get(name)!;
}

/** Budgets chosen so a real person never notices and a script does immediately. */
const RULES = {
  // A serious job hunt is maybe a dozen applications in a sitting.
  apply: { tokens: 20, window: "1 h" as const, message: "You have applied to a lot of roles just now. Please try again in a little while." },
  // Even a busy recruiter does not post 30 roles an hour.
  post: { tokens: 30, window: "1 h" as const, message: "Too many postings in a short time. Please try again shortly." },
  // Reporting is cheap to abuse and expensive to moderate.
  report: { tokens: 10, window: "1 h" as const, message: "Too many reports in a short time. Please try again later." },
  upload: { tokens: 20, window: "1 h" as const, message: "Too many uploads. Please try again shortly." },
};

export type LimitKind = keyof typeof RULES;

/**
 * Returns null when the action may proceed, or an error object to return
 * straight to the caller.
 */
export async function checkLimit(
  kind: LimitKind,
  userId: string
): Promise<{ error: string } | null> {
  const rule = RULES[kind];
  const rl = limiter(kind, rule.tokens, rule.window);
  if (!rl) return null; // not configured — see the fail-open note above

  try {
    const { success } = await rl.limit(userId);
    return success ? null : { error: rule.message };
  } catch (e) {
    console.error(
      `[ratelimit] ${kind} check failed, allowing through:`,
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

import "server-only";
import { createHash } from "crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Recording that someone looked at a job.
 *
 * The employer dashboard could previously only show applications, with no
 * denominator: two applications on a role means something completely different
 * at 40 views than at 4000, and there was no way to tell them apart.
 *
 * Dedupe is per viewer per day, done in the database. The key here is
 * deliberately one-way — a salted hash of IP + user agent for anonymous
 * visitors, the user id for signed-in ones — so cns_job_views can never be
 * turned back into "which nurse read which job from which address".
 */

/**
 * A per-deployment salt. Without one the hash is a rainbow table over the IPv4
 * space, which would make the "anonymised" key trivially reversible.
 * Falls back to the Supabase URL so a missing env var degrades to a stable,
 * deployment-specific value rather than to no salt at all.
 */
const SALT =
  process.env.JOB_VIEW_SALT ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "cns-job-views";

function anonymousKey(ip: string, ua: string): string {
  return createHash("sha256").update(`${SALT}:${ip}:${ua}`).digest("hex").slice(0, 32);
}

export async function recordJobView(jobId: string): Promise<void> {
  try {
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getClaims();
    const uid = auth?.claims?.sub as string | undefined;

    let viewerKey: string;
    if (uid) {
      viewerKey = `u:${uid}`;
    } else {
      const h = headers();
      // x-forwarded-for is a list; the client is the first entry. Vercel sets
      // x-real-ip too, which is already the single client address.
      const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
      const ip = fwd || h.get("x-real-ip") || "unknown";
      viewerKey = `a:${anonymousKey(ip, h.get("user-agent") ?? "")}`;
    }

    await supabase.rpc("cns_record_job_view", {
      p_job_id: jobId,
      p_viewer_key: viewerKey,
    });
  } catch {
    // Analytics must never take down a job page. A view that goes unrecorded
    // costs a row in a chart; a thrown error costs the applicant.
  }
}

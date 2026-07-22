import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Closes job postings past their application deadline. Daily, via vercel.json.
 *
 * This is not housekeeping — it protects the acquisition channel. Google reads
 * a missing or elapsed validThrough as a quality signal against a listing, and
 * a board carrying many stale undated jobs can receive a manual action that
 * removes EVERY job it has. Closed jobs also drop out of sitemap.xml
 * automatically, since that is generated from published rows.
 *
 * Runs as service role: cns_close_expired_jobs() is revoked from anon and
 * authenticated precisely so no user session can mass-close listings.
 */
export async function GET(request: NextRequest) {
  // Vercel sends `Authorization: Bearer <CRON_SECRET>`. CNS uses its OWN
  // secret — HUB's CRON_SECRET is deliberately withheld from this app so it
  // can never trigger HUB's cron endpoints.
  const secret = process.env.CNS_CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("cns_close_expired_jobs");
    if (error) {
      console.error("[cron] close-expired-jobs failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const closed = (data as number) ?? 0;
    if (closed > 0) console.log(`[cron] closed ${closed} expired job(s)`);
    return NextResponse.json({ ok: true, closed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("[cron] close-expired-jobs threw:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

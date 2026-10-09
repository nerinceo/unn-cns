import { NextResponse, type NextRequest } from "next/server";
import { runAllSources } from "@/lib/cns/job-import/run";
import { logError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Imports nursing and healthcare roles from every enabled source in
 * /admin/job-sources. Four times a day, via vercel.json.
 *
 * Sources run one after another inside a time budget that leaves headroom
 * under maxDuration; anything cut off runs first next time.
 */
export async function GET(request: NextRequest) {
  // FAILS CLOSED, same as the other CNS crons. The project's CRON_SECRET (what
  // Vercel sends) must equal CNS_CRON_SECRET.
  const secret = process.env.CNS_CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const results = await runAllSources(240_000);
    console.log(`[cron] import-jobs: ${JSON.stringify(results)}`);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    logError("cron:import-jobs", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}

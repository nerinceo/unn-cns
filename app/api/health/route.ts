import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated liveness probe — the only path in PUBLIC_PATHS.
 * Deliberately leaks nothing beyond build identity.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "unn-cns",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    env: process.env.VERCEL_ENV ?? "development",
    // Surfaced so it is obvious at a glance whether the gate is still relaxed.
    publicPreview: process.env.CNS_PUBLIC_PREVIEW === "1",
  });
}

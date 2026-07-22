import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily job alerts (blueprint §6.4).
 *
 * Deliberately daily rather than instant. §6.4 says so, and it is the right
 * call: an instant alert needs a queue, per-event fan-out and a dedupe story,
 * while a daily digest is one query and one notification per member. The
 * difference in value to a job hunter is negligible.
 *
 * In-app only. CNS holds no Resend credentials, so an email digest would mean
 * either giving this app the ability to mail the whole member base, or calling
 * a HUB endpoint. Neither is worth it before anyone has asked for email.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CNS_CRON_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const admin = createAdminClient();

    const { data: alerts } = await admin
      .from("cns_job_alerts")
      .select("id,user_id,countries,roles,last_sent_at")
      .eq("is_active", true);

    if (!alerts?.length) return NextResponse.json({ ok: true, sent: 0 });

    // One read of everything published in the last day, matched in memory.
    // Far cheaper than a query per subscriber, and the volume is tiny.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: fresh } = await admin
      .from("cns_jobs")
      .select("id,title,slug,country,nursing_role,published_at")
      .eq("status", "active")
      .gte("published_at", since);

    if (!fresh?.length) return NextResponse.json({ ok: true, sent: 0, newJobs: 0 });

    const notifications: Record<string, unknown>[] = [];
    const sentFor: string[] = [];

    for (const a of alerts) {
      const countries = (a.countries as string[]) ?? [];
      const roles = (a.roles as string[]) ?? [];

      // An alert with no preferences would match everything and become spam.
      if (!countries.length && !roles.length) continue;

      // Do not re-send within the day if the cron runs twice.
      if (a.last_sent_at && new Date(a.last_sent_at as string) > new Date(since)) continue;

      const matches = fresh.filter(
        (j) =>
          (!countries.length || countries.includes(j.country as string)) &&
          (!roles.length || roles.includes(j.nursing_role as string))
      );
      if (!matches.length) continue;

      notifications.push({
        user_id: a.user_id,
        notification_type: "cns_job_alert",
        message:
          matches.length === 1
            ? `New role matching your alert: ${matches[0].title}`
            : `${matches.length} new roles match your job alert.`,
        reference_id: matches[0].id,
      });
      sentFor.push(a.id as string);
    }

    if (notifications.length) {
      await admin.from("notifications").insert(notifications);
      await admin
        .from("cns_job_alerts")
        .update({ last_sent_at: new Date().toISOString() })
        .in("id", sentFor);
    }

    console.log(`[cron] job-alerts: ${notifications.length} sent, ${fresh.length} new jobs`);
    return NextResponse.json({ ok: true, sent: notifications.length, newJobs: fresh.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("[cron] job-alerts failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

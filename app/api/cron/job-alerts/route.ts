import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers, type NotifyInput } from "@/lib/cns/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALERT_PAGE = 1000;

/**
 * Daily job alerts (blueprint §6.4).
 *
 * Deliberately daily rather than instant. §6.4 says so, and it is the right
 * call: an instant alert needs a queue, per-event fan-out and a dedupe story,
 * while a daily digest is one query and one notification per member. The
 * difference in value to a job hunter is negligible.
 *
 * Delivered in-app always, and by email once RESEND_API_KEY is set. A digest
 * that only exists inside the app reaches a job hunter the next time they
 * happen to open it, which for the people this is most useful to is not soon.
 */
export async function GET(request: NextRequest) {
  // FAILS CLOSED (2026-09-28). With CNS_CRON_SECRET unset this used to skip
  // the check, so anyone could trigger job-alert emails to every subscriber.
  // The project's CRON_SECRET (what Vercel sends) must equal CNS_CRON_SECRET.
  const secret = process.env.CNS_CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();

    // PAGED. PostgREST returns at most 1,000 rows per request, so a single
    // select silently dropped every subscriber past the first thousand — they
    // just never got a digest. Ordered by id so the pages are stable.
    type AlertRow = {
      id: string;
      user_id: string;
      countries: string[] | null;
      roles: string[] | null;
      last_sent_at: string | null;
    };
    const alerts: AlertRow[] = [];
    for (let from = 0; ; from += ALERT_PAGE) {
      const { data: page, error } = await admin
        .from("cns_job_alerts")
        .select("id,user_id,countries,roles,last_sent_at")
        .eq("is_active", true)
        .order("id")
        .range(from, from + ALERT_PAGE - 1);
      if (error) throw new Error(error.message);
      alerts.push(...((page ?? []) as AlertRow[]));
      if (!page || page.length < ALERT_PAGE) break;
    }

    if (!alerts.length) return NextResponse.json({ ok: true, sent: 0 });

    // One read of everything published in the last day, matched in memory.
    // Far cheaper than a query per subscriber, and the volume is tiny.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: fresh } = await admin
      .from("cns_jobs")
      .select("id,title,slug,country,nursing_role,published_at")
      .eq("status", "active")
      .gte("published_at", since);

    if (!fresh?.length) return NextResponse.json({ ok: true, sent: 0, newJobs: 0 });

    const notifications: NotifyInput[] = [];
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

      const summary =
        matches.length === 1
          ? `New role matching your alert: ${matches[0].title}`
          : `${matches.length} new roles match your job alert.`;

      notifications.push({
        userId: a.user_id as string,
        type: "cns_job_alert",
        message: summary,
        referenceId: matches[0].id as string,
        email: {
          subject:
            matches.length === 1
              ? `New nursing role: ${matches[0].title}`
              : `${matches.length} new nursing roles match your alert`,
          heading: summary,
          // The titles themselves, not just a count — the whole point of the
          // digest is deciding whether it is worth opening, and a bare number
          // cannot answer that.
          body: matches
            .slice(0, 5)
            .map((m) => m.title as string)
            .join(" · "),
          ctaLabel: "See the roles",
          ctaHref: "/jobs",
        },
      });
      sentFor.push(a.id as string);
    }

    if (notifications.length) {
      await notifyUsers(notifications);
      // Chunked: `.in()` rides in the URL, and thousands of ids overflow it —
      // the update then failed and every alert re-sent the next day.
      const now = new Date().toISOString();
      for (let i = 0; i < sentFor.length; i += 150) {
        await admin
          .from("cns_job_alerts")
          .update({ last_sent_at: now })
          .in("id", sentFor.slice(i, i + 150));
      }
    }

    console.log(`[cron] job-alerts: ${notifications.length} sent, ${fresh.length} new jobs`);
    return NextResponse.json({ ok: true, sent: notifications.length, newJobs: fresh.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("[cron] job-alerts failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

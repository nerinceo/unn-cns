import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Notifying a member — in-app always, by email when CNS is allowed to send.
 *
 * WHY THIS EXISTS
 *
 *   Every notification in CNS was in-app only, and the comments said why: the
 *   app holds no email credentials. The consequence is that a nurse learns she
 *   has been shortlisted only if she happens to open CNS. Silence after
 *   applying is the single most damaging thing a job board does, and it was
 *   built in.
 *
 * HOW IT DEGRADES
 *
 *   Email is strictly additive. With no RESEND_API_KEY set, this behaves
 *   exactly as the old code did — the in-app row is written and nothing is
 *   sent — so it is safe to deploy before the credential exists. Setting the
 *   key is what turns sending on, deliberately: CNS's capabilities are granted
 *   one at a time, never wholesale.
 *
 *   The in-app write is never skipped because sending failed, and a send is
 *   never retried in a way that could double-notify. A dropped email costs one
 *   message; a lost in-app row loses the record permanently.
 */

const RESEND_BATCH_ENDPOINT = "https://api.resend.com/emails/batch";
// Resend's batch endpoint takes up to 100 messages per call.
const RESEND_BATCH_MAX = 100;
// PostgREST carries `.in()` lists in the URL — keep each one short.
const IN_LIST_CHUNK = 150;
// One POST per chunk of in-app rows, so a daily digest to thousands of members
// is a handful of inserts rather than one enormous body.
const INSERT_CHUNK = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Sending is off until a key exists. This is the only switch. */
export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

const FROM = process.env.CNS_EMAIL_FROM ?? "Nerusalem <notifications@nerusalem.com>";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cns.nerusalem.com";
// Hosted PNG (email clients do not render SVG): the Nerusalem crest icon. Same object as hpanel-upload/_brand/logo/nerusalem-mark-256.png (256x256), shown at 56x56 so it stays sharp on 2x/3x screens.
const EMAIL_LOGO_URL = "https://media.nerusalem.com/brand/logo/nerusalem-mark-256.png";

export type EmailContent = {
  subject: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  /** Path or absolute URL. Relative paths are resolved against the CNS site. */
  ctaHref?: string;
};

export type NotifyInput = {
  userId: string;
  /** Free-form; matches the existing notification_type strings. */
  type: string;
  message: string;
  referenceId?: string | null;
  /** Omit to write in-app only. */
  email?: EmailContent | null;
};

export async function notifyUser(input: NotifyInput): Promise<void> {
  await notifyUsers([input]);
}

/**
 * Batched at every step: in-app rows in chunked inserts, recipient lookups in
 * chunked reads, email through Resend's BATCH endpoint (100 per call, calls
 * one after another).
 *
 * The employer fan-out ("new application") hits every approved member of an
 * organisation, and the daily job-alert digest hits every subscriber. Email
 * used to go out as one request per recipient, all at once — against Resend's
 * ~10 requests/second ceiling, so a digest to a few hundred members came back
 * mostly 429 and was dropped. Batched, 1,000 recipients is 10 calls.
 */
export async function notifyUsers(inputs: NotifyInput[]): Promise<void> {
  if (!inputs.length) return;
  const admin = createAdminClient();

  // 1. In-app. Never conditional on email working.
  for (const part of chunk(inputs, INSERT_CHUNK)) {
    try {
      await admin.from("notifications").insert(
        part.map((n) => ({
          user_id: n.userId,
          notification_type: n.type,
          message: n.message,
          reference_id: n.referenceId ?? null,
        }))
      );
    } catch {
      // A failed insert must not take down the action that triggered it — an
      // employer shortlisting someone should not see an error because the
      // notification table was briefly unavailable.
    }
  }

  // 2. Email, if allowed.
  const wantEmail = inputs.filter((n) => n.email);
  if (!wantEmail.length || !emailEnabled()) return;

  try {
    // users.email left the session grant in migration 0020, so it is only
    // readable through the service role.
    const byId = new Map<string, { email: string | null; name: string | null }>();
    const ids = Array.from(new Set(wantEmail.map((n) => n.userId)));
    for (const part of chunk(ids, IN_LIST_CHUNK)) {
      const { data: rows } = await admin.from("users").select("id,email,full_name").in("id", part);
      for (const r of rows ?? []) {
        byId.set(r.id as string, {
          email: r.email as string | null,
          name: (r.full_name as string | null) ?? null,
        });
      }
    }

    const messages = wantEmail.flatMap((n) => {
      const to = byId.get(n.userId);
      return to?.email ? [buildMessage(to.email, to.name, n.email!)] : [];
    });

    for (const batch of chunk(messages, RESEND_BATCH_MAX)) {
      await sendBatch(batch);
    }
  } catch {
    // Same rule: delivery is best-effort, the in-app record is the source of
    // truth, and neither failure is worth surfacing to the person who acted.
  }
}

type OutgoingEmail = { from: string; to: string[]; subject: string; html: string; text: string };

function buildMessage(to: string, name: string | null, content: EmailContent): OutgoingEmail {
  const href = content.ctaHref
    ? content.ctaHref.startsWith("http")
      ? content.ctaHref
      : `${SITE}${content.ctaHref.startsWith("/") ? "" : "/"}${content.ctaHref}`
    : null;

  return {
    from: FROM,
    to: [to],
    subject: content.subject,
    html: renderEmail(name, content, href),
    text: `${content.heading}\n\n${content.body}${href ? `\n\n${href}` : ""}`,
  };
}

/**
 * One batch call. A 429 or 5xx is retried twice with jittered backoff — safe,
 * because Resend rejects a failed batch whole, so a retry cannot double-send.
 * Anything else is logged, not thrown.
 */
async function sendBatch(batch: OutgoingEmail[]): Promise<void> {
  const delays = [500, 1500];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    let status = 0;
    try {
      const res = await fetch(RESEND_BATCH_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
        // A hung mail API must not hold an employer's status change open.
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return;
      status = res.status;
      if (status !== 429 && status < 500) {
        // Logged, not thrown. Visible in Vercel logs without breaking the action.
        console.error("[cns/notify] resend batch failed", status, await res.text().catch(() => ""));
        return;
      }
    } catch {
      // Timeout / network — retry.
    }
    if (attempt === delays.length) {
      console.error(`[cns/notify] resend batch of ${batch.length} failed after retries`, status);
      return;
    }
    const base = delays[attempt];
    await new Promise((r) => setTimeout(r, Math.random() * base + base / 2));
  }
}

/**
 * Plain, light, table-free HTML.
 *
 * Inline styles only — Gmail strips <style> blocks — and a light background
 * throughout: these land next to hospital correspondence and should read as
 * correspondence, not as marketing.
 */
function renderEmail(name: string | null, c: EmailContent, href: string | null): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const greeting = name ? `Hi ${esc(name.split(" ")[0])},` : "Hi,";

  return `<div style="background:#f6f7f9;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
    <img src="${EMAIL_LOGO_URL}" width="56" height="56" alt="Nerusalem" style="display:block;margin:0 0 16px;border:0;width:56px;height:56px;color:#0a2463;font-size:20px;font-weight:700;line-height:56px;" />
    <h1 style="margin:0 0 12px;font-size:19px;line-height:1.35;color:#111827;">${esc(c.heading)}</h1>
    <p style="margin:0 0 8px;font-size:14px;color:#374151;">${greeting}</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">${esc(c.body)}</p>
    ${
      href
        ? `<a href="${href}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">${esc(
            c.ctaLabel ?? "Open"
          )}</a>`
        : ""
    }
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#9ca3af;">
      You are receiving this because of activity on your Nerusalem account.
      Manage what reaches you in your <a href="${SITE}/profile" style="color:#6b7280;">profile settings</a>.
    </p>
  </div>
</div>`;
}

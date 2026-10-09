/**
 * UNN Learn — certificate display helpers, shared by the learner's own
 * certificate page and the public /verify page.
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://cns.nerusalem.com").replace(/\/+$/, "");

/** The public check link printed on every certificate. */
export function certificateVerifyUrl(code: string): string {
  return `${SITE_URL}/verify/${code}`;
}

export function formatIssuedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

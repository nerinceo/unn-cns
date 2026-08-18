/**
 * Links back into HUB (unn.nerusalem.com).
 *
 * Cross-origin navigation, so always a plain <a href>, never next/link —
 * prefetching another origin is wasted work and Link's client-side routing
 * cannot apply.
 */

export const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? "https://unn.nerusalem.com";

export function hubLink(path = "/"): string {
  return `${HUB_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** A marketplace listing — where CNS sends members to buy locked content. */
export function hubListing(listingId: string): string {
  return hubLink(`/marketplace/${listingId}`);
}

/**
 * HUB's watermarked pdf.js reader for a purchased digital file.
 *
 * CNS deliberately does not re-implement this: the reader carries per-page
 * canvas watermarking and short-lived presigned URLs, and duplicating it would
 * mean duplicating the entitlement check too — the exact drift that leaks paid
 * content. Shared SSO makes the hand-off seamless.
 */
export function hubReader(listingId: string, fileIndex = 0): string {
  return hubLink(`/marketplace/${listingId}/read?f=${fileIndex}`);
}

/**
 * An organisation's website as a safe absolute link, or null.
 *
 * Websites saved before validation (and UHN organisations projected into
 * cns_employers) can be bare hosts like "navzz.com". Rendered as href they are
 * RELATIVE links — /employers/navzz.com, a 404 (found 2026-10-08). A missing
 * scheme gets https://; anything that is not http(s) (javascript:, data:) is
 * dropped rather than linked.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

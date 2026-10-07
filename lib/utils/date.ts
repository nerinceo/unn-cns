/**
 * Deterministic date formatting.
 *
 * WHY NOT toLocaleDateString(): it resolves against the runtime's locale, and
 * the server's is not the browser's. In a client component that is a hydration
 * mismatch — React logged "Text content did not match. Server: 7/8/2026
 * Client: 07/08/2026" and then threw away the server render for the ENTIRE
 * root, falling back to client rendering. One date turned every server-rendered
 * card on the page into wasted work.
 *
 * The second reason is worse than the first. "07/08/2026" means 7 August to a
 * nurse in Bengaluru or London and 8 July to one in Chicago, and this product
 * deliberately spans all three. A named month cannot be misread.
 */

// Month names are spelled out here rather than taken from Intl: the en-GB
// "short" month for September is "Sept" in Node 22's ICU data and "Sep" in
// other runtimes — the very server/browser mismatch this module exists to
// prevent (QA 2026-10-07). Read in UTC for the same reason.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "07 Aug 2026". Empty string for a missing or unparseable value. */
export function formatDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

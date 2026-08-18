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

const FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  // Pinned: without it the server formats in its own zone and the browser in
  // the viewer's, which reintroduces the mismatch for dates near midnight.
  timeZone: "UTC",
});

/** "07 Aug 2026". Empty string for a missing or unparseable value. */
export function formatDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return FMT.format(d);
}

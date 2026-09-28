/**
 * Serialise structured data for a `<script type="application/ld+json">` tag.
 *
 * `JSON.stringify` alone is NOT safe inside a script element: the HTML parser
 * ends the script at the first `</script>`, whatever JSON quoting surrounds it.
 * Job titles, cities and employer names are employer-written, so a title of
 * `</script><script>…` ran as script for every visitor to a public job page.
 *
 * Escaping `<`, `>` and `&` as < / > / & (and the two JS line
 * terminators) yields byte-different but value-IDENTICAL JSON — search engines
 * parse exactly the same object — while the HTML parser can no longer see a
 * closing tag inside it.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Question Bank Pro answers as HTML — the source's formatAnswer, server side.
 *
 * Answers arrive three ways: plain text with inline numbering ("…: 1. Fibrous
 * joints … 2. …"), markdown-ish lines, or HTML (4,127 of them). The rules are
 * the source page's own, so a question reads exactly as it did there:
 *   - HTML with lists, tables or headings is kept, cleaned to an allowlist;
 *   - HTML that is just emphasis is kept, unless the text inside carries
 *     inline numbering, which is then laid out as a list;
 *   - everything else is split into paragraphs, numbered and bulleted lists,
 *     and "Definition:"-style section headings.
 *
 * Every byte of the result passes sanitize-html: no attributes beyond
 * ol[start] and the heading class, no scripts, no styles, no links.
 */

const SAFE_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "h2", "h3", "h4", "sub", "sup", "span", "div", "blockquote", "hr", "mark", "small", "code", "pre",
];

function clean(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: SAFE_TAGS,
    allowedAttributes: { ol: ["start"], div: ["class"] },
    allowedClasses: { div: ["qb-heading"] },
    allowedSchemes: [],
    disallowedTagsMode: "discard",
  });
}

const textOf = (html: string) => decode(sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }));

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function inline(text: string, markTerm = false): string {
  let h = esc(text).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  if (markTerm) h = h.replace(/^([A-Za-z][A-Za-z\s,/()&;-]{1,70}:)/, "<strong>$1</strong>");
  return h;
}

const HEADINGS = [
  "Definition", "Introduction", "Classification", "Types", "Causes", "Etiology", "Risk Factors", "Signs and Symptoms",
  "Clinical Features", "Pathophysiology", "Investigations", "Diagnosis", "Management", "Medical Management",
  "Surgical Management", "Nursing Management", "Nursing Interventions", "Prevention", "Complications", "Conclusion",
];
const HEADING_LINE =
  /^(Definition|Introduction|Classification(?: of .+)?|Types|Causes|Etiology|Risk Factors|Signs and Symptoms|Clinical Features|Pathophysiology|Investigations|Diagnosis|Management|Medical Management|Surgical Management|Nursing Management|Nursing Interventions|Prevention|Complications|Factors Affecting .+|Conclusion)\s*:\s*(.*)$/i;

function formatPlain(input: string): string {
  let raw = input.replace(/\r\n?/g, "\n").replace(/ /g, " ").trim();
  raw = raw
    .replace(/([.;:])\s+(?=\d{1,2}[.)]\s+[A-Za-z])/g, "$1\n")
    .replace(/([a-zA-Z)])\s+(?=\d{1,2}[.)]\s+[A-Z])/g, "$1\n")
    .replace(/([^\n])\s+(?=[•●]\s+)/g, "$1\n");
  for (const hd of HEADINGS) raw = raw.replace(new RegExp(`([^\\n])\\s+(${hd})\\s*:`, "gi"), "$1\n$2:");

  let html = "";
  let list = "";
  let next: number | null = null;
  const close = () => {
    if (list) {
      html += `</${list}>`;
      list = "";
      next = null;
    }
  };
  const open = (t: "ol" | "ul", num = 1) => {
    if (list === t && (t !== "ol" || num === next)) return;
    close();
    html += t === "ol" ? `<ol${num !== 1 ? ` start="${num}"` : ""}>` : "<ul>";
    list = t;
    next = t === "ol" ? num : null;
  };
  for (const line of raw.split(/\n+/).map((x) => x.trim()).filter(Boolean)) {
    const numbered = line.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (numbered) {
      const n = Number(numbered[1]);
      open("ol", n);
      html += `<li>${inline(numbered[2], true)}</li>`;
      next = n + 1;
      continue;
    }
    const bullet = line.match(/^[•●*-]\s+(.+)$/);
    if (bullet) {
      open("ul");
      html += `<li>${inline(bullet[1], true)}</li>`;
      continue;
    }
    close();
    const hd = line.match(HEADING_LINE);
    if (hd) {
      html += `<div class="qb-heading">${esc(hd[1])}</div>`;
      if (hd[2]) html += `<p>${inline(hd[2])}</p>`;
      continue;
    }
    const markdown = line.match(/^#{1,4}\s+(.+)$/);
    if (markdown) {
      html += `<div class="qb-heading">${inline(markdown[1])}</div>`;
      continue;
    }
    html += `<p>${inline(line)}</p>`;
  }
  close();
  return html;
}

/** An answer, rationale or exam tip as safe HTML; null when there is nothing to show. */
export function formatAnswer(value: unknown): string | null {
  if (value == null || String(value).trim() === "") return null;
  let raw = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value).trim();
  if (/&lt;\/?[a-z][^&]*&gt;/i.test(raw)) raw = decode(raw);
  if (/<\/?[a-z][^>]*>/i.test(raw)) {
    if (/<(ol|ul|table|h2|h3|h4)\b/i.test(raw)) return clean(raw);
    const text = textOf(raw);
    if (!/[;:.]\s+\d{1,2}[.)]\s+[A-Za-z]/.test(text) && /<(strong|b|em|i)\b/i.test(raw)) return clean(raw);
    raw = textOf(raw.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(p|div|h1|h2|h3|h4)\b[^>]*>/gi, "\n"));
  }
  return clean(formatPlain(raw)) || null;
}

/** Revision-note fragments: their only markup is <strong> on key terms. */
export function formatNoteHtml(html: string): string {
  return sanitizeHtml(html, { allowedTags: ["strong", "b", "em", "i"], allowedAttributes: {} });
}

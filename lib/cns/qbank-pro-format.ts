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
  // Not after a bullet marker: "- Causes: …" is a list item, not a heading.
  for (const hd of HEADINGS) raw = raw.replace(new RegExp(`([^\\n•●*-])\\s+(${hd})\\s*:`, "gi"), "$1\n$2:");

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

// Markdown pipe tables (134 answers; cells may hold <strong>): a header row
// with a "|---|---|" rule under it, then rows. Outer pipes are optional, and a
// row left open (leading "|" but no closing one) continues on the next lines —
// a cell written over several lines, kept as line breaks.
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const CELL_BREAK = " ";
function tableHtml(head: string, rows: string[]): string {
  const cells = (r: string) => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const cell = (tag: "th" | "td", c: string) =>
    `<${tag}>${c
      .split(CELL_BREAK)
      .map((p) => (/<[a-z]/i.test(p) ? p : inline(p)))
      .join("<br>")}</${tag}>`;
  return (
    `<table><thead><tr>${cells(head).map((c) => cell("th", c)).join("")}</tr></thead>` +
    `<tbody>${rows.map((r) => `<tr>${cells(r).map((c) => cell("td", c)).join("")}</tr>`).join("")}</tbody></table>`
  );
}
function splitTables(raw: string): string | null {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const startsAt = (i: number) => lines[i].includes("|") && !TABLE_RULE.test(lines[i]) && TABLE_RULE.test(lines[i + 1] ?? "");
  if (!lines.some((_, i) => startsAt(i))) return null;
  const out: string[] = [];
  let text: string[] = [];
  const flushText = () => {
    const t = text.join("\n").trim();
    if (t) out.push(formatAnswer(t) ?? "");
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (!startsAt(i)) {
      text.push(lines[i]);
      continue;
    }
    flushText();
    const head = lines[i];
    const rows: string[] = [];
    let j = i + 2;
    for (; j < lines.length; j++) {
      const l = lines[j].trim();
      const last = rows.length ? rows[rows.length - 1].trim() : "";
      const open = last.startsWith("|") && !last.endsWith("|");
      if (TABLE_RULE.test(l)) continue;
      if (open && l && !l.startsWith("|")) rows[rows.length - 1] += CELL_BREAK + l;
      else if (l.includes("|")) rows.push(l);
      else break;
    }
    out.push(tableHtml(head, rows));
    i = j - 1;
  }
  flushText();
  return clean(out.join("")) || null;
}

/** An answer, rationale or exam tip as safe HTML; null when there is nothing to show. */
export function formatAnswer(value: unknown): string | null {
  if (value == null || String(value).trim() === "") return null;
  let raw = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value).trim();
  if (raw.includes("|")) {
    const withTables = splitTables(/&lt;\/?[a-z][^&]*&gt;/i.test(raw) ? decode(raw) : raw);
    if (withTables) return withTables;
  }
  if (/&lt;\/?[a-z][^&]*&gt;/i.test(raw)) raw = decode(raw);
  if (/<\/?[a-z][^>]*>/i.test(raw)) {
    if (/<(ol|ul|table|h2|h3|h4)\b/i.test(raw)) return clean(raw);
    const text = textOf(raw);
    if (!/[;:.]\s+\d{1,2}[.)]\s+[A-Za-z]/.test(text) && /<(strong|b|em|i)\b/i.test(raw)) return clean(raw);
    raw = textOf(raw.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(p|div|h1|h2|h3|h4)\b[^>]*>/gi, "\n"));
  }
  // Fenced blocks (```…```, mostly ASCII diagrams) keep their spacing as <pre>.
  if (raw.includes("```")) {
    const html = raw
      .split(/```[A-Za-z]*\n?/)
      .map((part, i) => (part.trim() === "" ? "" : i % 2 ? `<pre>${esc(part.replace(/\n+$/, ""))}</pre>` : formatPlain(part)))
      .join("");
    return clean(html) || null;
  }
  return clean(formatPlain(raw)) || null;
}

// A markdown table rule left as text ("|---|---|"): thinkqi.com's Model page
// prints those tables raw; formatAnswer lays them out, so they keep that.
const RAW_TABLE = /\|\s*:?-{3,}/;

/**
 * An answer, rationale or exam tip as thinkqi.com formats it: the rendering
 * stored at import time by thinkqi.com's own page code (qbank2.render_html,
 * handed out by qbank2_rpc as answer_html / rationale_html / tip_html), cleaned
 * to the same allowlist as everything else. Falls back to formatAnswer when the
 * row has no rendering, or when the rendering left a markdown table as text.
 */
export function proHtml(stored: unknown, raw: unknown): string | null {
  if (typeof stored !== "string" || stored.trim() === "") return formatAnswer(raw);
  if (RAW_TABLE.test(stored)) {
    const own = formatAnswer(raw);
    if (own?.includes("<table")) return own;
  }
  return clean(stored.replace(/class="answer-section-heading"/g, 'class="qb-heading"')) || formatAnswer(raw);
}

/** Revision-note fragments: their only markup is <strong> on key terms. */
export function formatNoteHtml(html: string): string {
  const safe = sanitizeHtml(html, { allowedTags: ["strong", "b", "em", "i"], allowedAttributes: {} });
  // Some source notes close the key-term highlight mid-word
  // ("<strong>Pharmacokinetics describ</strong>es", Semester 4): finish the word.
  return safe.replace(/([A-Za-z])<\/(strong|b)>([A-Za-z]+)/g, "$1$3</$2>");
}

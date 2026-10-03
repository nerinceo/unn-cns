import sanitizeHtml from "sanitize-html";

// Allowlist deliberately matches what Tiptap's StarterKit + Link emit. Anything
// not on this list is stripped server-side so direct REST / mobile / future
// API clients can't smuggle raw <script>, onerror=, javascript: etc. into
// rendered HTML. Keep in lockstep with the Tiptap schema used in the editor.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "blockquote", "pre", "code",
    "strong", "em", "s", "u",
    "a", "span",
  ],
  allowedAttributes: {
    a: ["href", "rel", "target"],
    span: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  // Always open links in a new tab, force rel="noopener noreferrer nofollow"
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer nofollow",
      target: "_blank",
    }),
  },
  // Drop contents of any stripped tags (e.g. <script>alert(1)</script> — the
  // text inside vanishes too, preventing partial reconstruction on the client).
  disallowedTagsMode: "discard",
};

/**
 * Sanitize HTML-capable user input (post body, article content, rich comment).
 * Plain text is safe to pass through — tags that aren't in the allowlist are
 * stripped, and unsupported attributes (on*, src, style, …) are dropped.
 */
export function sanitizeRichText(input: string | null | undefined): string {
  if (!input) return "";
  return sanitizeHtml(input, OPTIONS);
}

/**
 * The write-side half of PostCard's HTML-or-text decision, for every row in
 * `posts` (posts AND moments — both render through PostCard).
 *
 * PostCard passes content matching this pattern to dangerouslySetInnerHTML and
 * renders everything else as a text node, so exactly what matches must be
 * sanitized, and nothing else may be: sanitize-html would turn plain clinical
 * text like "SpO2 <95%" into "&lt;95%" or drop it. Trims either way.
 *
 * Keep the pattern in lockstep with components/platform/PostCard.tsx
 * (isRichHtml). Not shared with it: PostCard is a client component, and
 * importing this file would pull sanitize-html into the browser bundle.
 */
export function sanitizePostContent(content: string): string {
  const rendersAsHtml = /<(p|h[1-6]|ul|ol|blockquote|strong|em|a|li|code)[\s>]/i.test(content);
  return rendersAsHtml ? sanitizeRichText(content.trim()) : content.trim();
}

/**
 * Undo the entity encoding sanitize-html applies on its way out.
 *
 * `&amp;` LAST, and that order is the whole correctness of this function.
 * Decoding it first would turn the encoded form of a literal "&lt;" —
 * "&amp;lt;" — into "<", inventing a character the user never typed and
 * undoing the tag stripping that just happened.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Sanitize a plain-text field (comment_text, reply_text, etc.). Strips ALL
 * HTML so nothing renders as markup. Use this for anything that is displayed
 * as text in the UI — cheaper and tighter than the rich-text allowlist.
 *
 * RETURNS TEXT, NOT HTML-SAFE TEXT, and that is the fix.
 *
 * sanitize-html exists to produce output safe to interpolate into markup, so
 * it entity-encodes `&`, `<` and `>` on the way out. These fields are never
 * interpolated into markup: they are stored as plain text and rendered by
 * React, which escapes on output anyway. So the value was encoded twice and
 * the reader saw the entities themselves — a nurse typing "SpO2 < 92%" or
 * "Q&A" got "SpO2 &lt; 92%" and "Q&amp;A" on the published announcement.
 *
 * Worse, it COMPOUNDS: the encoded value is read back into the edit form and
 * re-saved, so "&" becomes "&amp;" becomes "&amp;amp;" with each edit. The
 * professional module hit this and forked its own copy rather than touch this
 * one (see lib/pro/sanitize.ts, which documents the same bug and concluded
 * HUB's behaviour was "correct for the nurse-facing callers"). It was not —
 * those callers are React components, which escape again.
 *
 * STILL SAFE. Tags are stripped by sanitize-html BEFORE anything is decoded,
 * so no markup survives to be reconstituted: "<script>x</script>" is discarded
 * tag and contents alike, and a typed-out "&lt;script&gt;" decodes back to the
 * literal text the user typed, which React then escapes on render. The one
 * thing this output must never do is reach dangerouslySetInnerHTML — that is
 * what sanitizeRichText() above is for, and it is deliberately unchanged.
 */
export function sanitizePlainText(input: string | null | undefined): string {
  if (!input) return "";
  return decodeEntities(
    sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} })
  );
}

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
 * Sanitize a plain-text field (comment_text, reply_text, etc.). Strips ALL
 * HTML so nothing renders as markup. Use this for anything that is displayed
 * as text in the UI — cheaper and tighter than the rich-text allowlist.
 */
export function sanitizePlainText(input: string | null | undefined): string {
  if (!input) return "";
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
}

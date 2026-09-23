import sanitizeHtml from "sanitize-html";

/**
 * The media host images are allowed to come from.
 *
 * Derived from R2_PUBLIC_URL so it follows the bucket's custom domain rather
 * than being spelled out twice. The `.nerusalem.com` fallback exists because
 * this module is also reachable from a bundle where a non-NEXT_PUBLIC_ env is
 * undefined — losing the env must narrow what is accepted, never widen it.
 */
const MEDIA_HOST = (() => {
  try {
    return new URL(process.env.R2_PUBLIC_URL ?? "").hostname.toLowerCase();
  } catch {
    return "";
  }
})();

/**
 * The media domains, spelled out rather than left to env alone.
 *
 * UHN WRITES this HTML and CNS RENDERS it, and the two apps do not carry the
 * same env: R2_PUBLIC_URL is set in UHN (media.unnhub.org) and absent in CNS.
 * If each app only trusted its own env, CNS would reject every image UHN just
 * saved — the allowlists would diverge by configuration rather than by code,
 * which is the failure this file's header warns about.
 *
 * Both media domains are listed because the platform is mid-migration from
 * unnhub.org to nerusalem.com and objects exist under both.
 */
const MEDIA_DOMAINS = ["nerusalem.com", "unnhub.org"] as const;

/**
 * Is this an image WE serve?
 *
 * Course article images are uploaded through the instructor portal and land on
 * the public R2 bucket, so a legitimate <img> always points at our own media
 * domain. Anything else is refused, which rules out three separate problems in
 * one check:
 *
 *   - `data:` URIs, which can carry an SVG with script inside it;
 *   - `javascript:` and other exotic schemes;
 *   - third-party hosts, which would see the IP of every learner who opens the
 *     lecture and could swap the image for something else after approval.
 *
 * A relative or unparseable src is refused too: there is no case where the
 * editor produces one, so it can only come from a hand-crafted payload.
 */
function isOwnMediaUrl(src: string | undefined): boolean {
  if (!src) return false;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (MEDIA_HOST && host === MEDIA_HOST) return true;
  // `endsWith("." + domain)` and not `endsWith(domain)`: the latter would also
  // accept evil-nerusalem.com, and the leading dot is what makes it a subdomain
  // rather than a suffix. A lookalike like media.nerusalem.com.evil.com fails
  // both tests because its last label is evil.com.
  return MEDIA_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

// Allowlist deliberately matches what Tiptap's StarterKit + Link + Image emit.
// Anything not on this list is stripped server-side so direct REST / mobile /
// future API clients can't smuggle raw <script>, onerror=, javascript: etc.
// into rendered HTML. Keep in lockstep with the Tiptap schema used in the
// editor — and with UHN's copy of this file, which AUTHORS the course HTML this
// app renders. If the two allowlists diverge, the more permissive one decides
// what actually reaches a learner's browser.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "blockquote", "pre", "code",
    "strong", "em", "s", "u",
    "a", "span",
    // Article images. Paired with the src check in transformTags below — the
    // tag being on this list is NOT on its own what makes it safe.
    "img", "figure", "figcaption",
  ],
  allowedAttributes: {
    a: ["href", "rel", "target"],
    span: ["class"],
    // No `style`, no `srcset`, no `on*`. Width/height are plain integers that
    // Tiptap writes when an instructor resizes an image.
    img: ["src", "alt", "title", "width", "height"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  transformTags: {
    // Always open links in a new tab, force rel="noopener noreferrer nofollow"
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer nofollow",
      target: "_blank",
    }),
    /**
     * An image from anywhere but our own media domain is renamed to a tag that
     * is not on the allowlist, so the pass that follows discards it outright.
     *
     * Renaming rather than filtering is deliberate: it is decided by the same
     * allowlist that governs every other tag, so there is one mechanism to
     * reason about instead of two.
     */
    img: (tagName, attribs) =>
      isOwnMediaUrl(attribs.src)
        ? { tagName: "img", attribs }
        : { tagName: "unn-blocked-image", attribs: {} },
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

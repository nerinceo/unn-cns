/**
 * Import the legacy WordPress blog (~9,000 published posts) into the CNS
 * library, preserving WordPress's categorisation exactly.
 *
 * PHASES — each is independently re-runnable and idempotent. Run them in order.
 *
 *   crawl     WordPress REST -> .tmp-wp/*.json on disk. Nothing touches
 *             Supabase. Re-running skips files that already exist (--refresh
 *             to force). Crawling and inserting are separate on purpose: a bug
 *             in the insert logic must not cost another 9,000 HTTP requests.
 *   terms     .tmp-wp -> cns_library_terms. Two passes, parents wired second.
 *   posts     .tmp-wp -> cns_library_articles + cns_library_article_terms.
 *   media     Collect image URLs from imported bodies, transfer them to R2,
 *             then rewrite the bodies to point at R2. Three sub-steps, each
 *             resumable via cns_library_media.status.
 *   verify    Reconcile what landed against what WordPress says exists —
 *             including against MySQL, if .tmp-wp/db-counts.json is present.
 *             The REST API renders content well but is not a trustworthy
 *             census; see reconcileWithDb() and docs/library-import.md.
 *
 * Usage:
 *   node scripts/import-wordpress.mjs crawl
 *   node scripts/import-wordpress.mjs terms  --dry-run
 *   node scripts/import-wordpress.mjs posts  --limit=50
 *   node scripts/import-wordpress.mjs media
 *   node scripts/import-wordpress.mjs verify
 *
 * Flags:
 *   --dry-run    report what would change, write nothing
 *   --limit=N    process at most N source rows (smoke tests)
 *   --refresh    re-crawl even if the cached JSON is present
 *
 * Config, from .env (never logged):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   WP_SITE_URL                  e.g. https://oldblog.example.com
 *   WP_USER, WP_APP_PASSWORD     optional; only needed if the REST API is
 *                                restricted. Published posts are public.
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET, R2_PUBLIC_URL     media phase only
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createHash, randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sanitizeHtml from "sanitize-html";

const phase = process.argv[2] ?? "";
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const flag = (name) => process.argv.includes(`--${name}`);

const DRY = flag("dry-run");
const REFRESH = flag("refresh");
const LIMIT = Number(arg("limit")) || Infinity;
const CACHE = ".tmp-wp";

const log = (...a) => console.log(...a);
const fail = (m) => {
  console.error("\n  " + m + "\n");
  process.exit(1);
};

// A missing .env should say so, not surface as an ENOENT stack trace from deep
// inside a helper.
const readEnv = (path) => {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  return Object.fromEntries(
    raw
      .split("\n")
      .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
      .map((l) => [
        l.slice(0, l.indexOf("=")).trim(),
        l.slice(l.indexOf("=") + 1).trim().replace(/^"(.*)"$/, "$1"),
      ])
  );
};

const env = { ...readEnv(".env"), ...process.env };
const WP = (env.WP_SITE_URL ?? "").replace(/\/+$/, "");

// Validated before createClient, which throws its own opaque error on a
// missing key.
const PHASES = ["crawl", "terms", "posts", "media", "verify"];
if (!PHASES.includes(phase)) {
  fail(`Usage: node scripts/import-wordpress.mjs <${PHASES.join("|")}> [--dry-run] [--limit=N] [--refresh]`);
}
if (phase !== "crawl" && !(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)) {
  fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
}

const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost",
  env.SUPABASE_SERVICE_ROLE_KEY ?? "unset",
  { auth: { persistSession: false } }
);

const BATCH_ID = randomUUID();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Read every row of a target table, not just the first 1000.
 *
 * PostgREST caps a single response at 1000 rows. Any "what have I already
 * imported?" query that forgets this silently sees only the first page — and
 * then re-inserts the other 8,000 posts as duplicates on the next run.
 */
async function readAll(table, select, applyFilters) {
  const out = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = db.from(table).select(select).range(from, from + page - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) fail(`${table} read: ${error.message}`);
    out.push(...data);
    if (data.length < page) return out;
  }
}

/** Insert in chunks. A single 9,000-row insert exceeds request limits. */
async function insertChunked(table, rows, chunk = 500, options) {
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = options
      ? await db.from(table).upsert(slice, options)
      : await db.from(table).insert(slice);
    if (error) fail(`${table} insert: ${error.message}`);
    process.stdout.write(`\r    ${Math.min(i + chunk, rows.length)}/${rows.length}`);
  }
  if (rows.length) process.stdout.write("\n");
}

/** GET with backoff. A 9,000-post crawl WILL hit a rate limit or a 502. */
async function get(url, tries = 5) {
  const headers = { Accept: "application/json" };
  if (env.WP_USER && env.WP_APP_PASSWORD) {
    headers.Authorization =
      "Basic " + Buffer.from(`${env.WP_USER}:${env.WP_APP_PASSWORD}`).toString("base64");
  }
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (e) {
      if (attempt >= tries) throw e;
      await new Promise((r) => setTimeout(r, attempt * 2000));
      continue;
    }
    if (res.ok) return { body: await res.json(), headers: res.headers };
    // Past the last page WordPress returns 400 rest_post_invalid_page_number.
    // That is the normal end of a crawl, not an error worth retrying.
    if (res.status === 400) return { body: null, headers: res.headers };
    if (attempt >= tries || (res.status < 500 && res.status !== 429)) {
      throw new Error(`${res.status} ${res.statusText} — ${url}`);
    }
    await new Promise((r) => setTimeout(r, attempt * 2000));
  }
}

/**
 * Page through a REST collection.
 *
 * Ordered by id ascending and deduped by id rather than trusting page windows:
 * if anything is published or deleted mid-crawl the windows shift underneath
 * us and posts get skipped or repeated.
 */
async function crawlAll(restBase, extra = "") {
  const seen = new Map();
  for (let page = 1; ; page++) {
    const url = `${WP}/wp-json/wp/v2/${restBase}?per_page=100&orderby=id&order=asc&page=${page}${extra}`;
    const { body, headers } = await get(url);
    if (!body || !body.length) break;
    for (const item of body) seen.set(item.id, item);
    if (page === 1) {
      const total = headers.get("x-wp-total");
      if (total) log(`    ${restBase}: ${total} reported by WordPress`);
    }
    process.stdout.write(`\r    fetched ${seen.size}`);
    if (body.length < 100) break;
  }
  if (seen.size) process.stdout.write("\n");
  return [...seen.values()];
}

const cachePath = (name) => `${CACHE}/${name}.json`;
const readCache = (name) => {
  if (!existsSync(cachePath(name))) fail(`Missing ${cachePath(name)} — run the crawl phase first.`);
  return JSON.parse(readFileSync(cachePath(name), "utf8"));
};
const writeCache = (name, data) => {
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cachePath(name), JSON.stringify(data));
  log(`    wrote ${cachePath(name)} (${data.length ?? Object.keys(data).length} items)`);
};

/** WordPress ships HTML entities in title/excerpt fields. */
const decode = (s) =>
  String(s ?? "")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&hellip;/g, "…")
    .replace(/&[a-z]+;/gi, " ")
    .trim();

/**
 * Sanitize a rendered WordPress body.
 *
 * srcset and sizes are STRIPPED deliberately. WordPress emits four or five
 * resized variants per image, so keeping them would multiply the R2 transfer
 * (and the media table) by roughly five for no benefit we can currently use —
 * Cloudflare resizes on the fly in front of R2. The `src` WordPress puts in
 * rendered content is already a sensible display size, not the raw original.
 *
 * iframes are allowed only for the video hosts, because dropping them turns
 * every embedded lecture into a blank gap, and allowing arbitrary iframes in
 * 9,000 posts of third-party HTML is how you ship a clickjacking surface.
 */
const EMBED_HOSTS = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com)\//;

function cleanBody(html) {
  return sanitizeHtml(String(html ?? ""), {
    allowedTags: [
      "p", "br", "hr", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "pre", "code",
      "strong", "b", "em", "i", "u", "s", "sup", "sub", "mark",
      "a", "img", "figure", "figcaption",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
      "iframe", "div", "span",
    ],
    allowedAttributes: {
      a: ["href", "title", "rel", "target"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      iframe: ["src", "width", "height", "allow", "allowfullscreen", "title"],
      th: ["colspan", "rowspan", "scope"],
      td: ["colspan", "rowspan"],
      "*": [],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    // h1 belongs to the page, not the body — a post whose content opens with
    // its own h1 gives every article two competing top-level headings.
    transformTags: {
      h1: "h2",
      a: (tag, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, rel: "noopener noreferrer nofollow" },
      }),
      img: (tag, attribs) => ({ tagName: "img", attribs: { ...attribs, loading: "lazy" } }),
    },
    exclusiveFilter: (f) => f.tag === "iframe" && !EMBED_HOSTS.test(f.attribs.src ?? ""),
    // Gutenberg leaves wrapper divs and spans everywhere. Keep the tag (it may
    // carry structure) but drop the wp-block-* classes and inline styles that
    // reference a stylesheet we do not have.
    allowedClasses: {},
    allowedStyles: {},
  });
}

const toText = (html) =>
  sanitizeHtml(String(html ?? ""), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();

const slugify = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "post";

// ---------------------------------------------------------------------------
// crawl
// ---------------------------------------------------------------------------
async function crawl() {
  if (!WP) fail("WP_SITE_URL is not set in .env");
  log(`\n  Crawling ${WP}\n`);
  mkdirSync(CACHE, { recursive: true });

  const need = (name) => REFRESH || !existsSync(cachePath(name));

  // Discover taxonomies rather than assuming category + tag. A nursing blog
  // routinely registers its own ("specialty", "condition"), and a taxonomy we
  // do not know about is categorisation silently thrown away.
  if (need("taxonomies")) {
    const { body } = await get(`${WP}/wp-json/wp/v2/taxonomies`);
    writeCache("taxonomies", body);
  }
  const taxonomies = readCache("taxonomies");

  const forPosts = Object.entries(taxonomies).filter(([, t]) => (t.types ?? []).includes("post"));
  log(`    taxonomies on posts: ${forPosts.map(([k]) => k).join(", ")}\n`);

  for (const [key, tax] of forPosts) {
    const name = `terms-${key}`;
    if (need(name)) writeCache(name, await crawlAll(tax.rest_base ?? key));
  }

  if (need("posts")) writeCache("posts", await crawlAll("posts", "&status=publish"));
  const posts = readCache("posts");

  if (need("users")) writeCache("users", await crawlAll("users"));

  // Only the featured images actually referenced, fetched by id in batches of
  // 100. Crawling /media wholesale on a 9,000-post blog means paging through
  // every attachment ever uploaded, most of which no live post uses.
  if (need("media")) {
    const ids = [...new Set(posts.map((p) => p.featured_media).filter(Boolean))];
    log(`    featured images referenced: ${ids.length}`);
    const out = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { body } = await get(
        `${WP}/wp-json/wp/v2/media?per_page=100&include=${ids.slice(i, i + 100).join(",")}`
      );
      if (body) out.push(...body);
      process.stdout.write(`\r    fetched ${out.length}/${ids.length}`);
    }
    if (out.length) process.stdout.write("\n");
    writeCache("media", out);
  }

  log(`\n  Crawl complete. ${posts.length} posts cached in ${CACHE}/\n`);
}

// ---------------------------------------------------------------------------
// terms
// ---------------------------------------------------------------------------
async function terms() {
  const taxonomies = readCache("taxonomies");
  const forPosts = Object.keys(taxonomies).filter((k) => (taxonomies[k].types ?? []).includes("post"));

  // WordPress internal names -> ours. 'post_tag' is the one that matters:
  // its REST base is 'tags' but its taxonomy key is 'post_tag'.
  const nameOf = (key) => (key === "post_tag" ? "tag" : key);

  const source = [];
  for (const key of forPosts) {
    for (const t of readCache(`terms-${key}`)) {
      source.push({
        taxonomy: nameOf(key),
        wp_term_id: t.id,
        wp_parent: t.parent || null,
        name: decode(t.name),
        slug: t.slug || slugify(t.name),
        description: decode(t.description) || null,
      });
    }
  }
  log(`\n  ${source.length} terms from ${forPosts.length} taxonomies`);

  const existing = await readAll("cns_library_terms", "id,taxonomy,wp_term_id");
  const key = (tax, wpId) => `${tax}:${wpId}`;
  const known = new Map(existing.map((r) => [key(r.taxonomy, r.wp_term_id), r.id]));

  const fresh = source.filter((t) => !known.has(key(t.taxonomy, t.wp_term_id)));
  log(`  ${known.size} already imported, ${fresh.length} new`);
  if (DRY) return log("\n  --dry-run: nothing written\n");

  // PASS 1 — insert every term with parent_id null. A child whose parent has
  // not been inserted yet would violate the foreign key, and WordPress does
  // not hand terms back in parent-first order.
  if (fresh.length) {
    await insertChunked(
      "cns_library_terms",
      fresh.map(({ wp_parent, ...t }) => ({ ...t, parent_id: null }))
    );
  }

  // PASS 2 — wire parents now that every id exists.
  const all = await readAll("cns_library_terms", "id,taxonomy,wp_term_id,parent_id");
  const idOf = new Map(all.map((r) => [key(r.taxonomy, r.wp_term_id), r.id]));
  const currentParent = new Map(all.map((r) => [r.id, r.parent_id]));

  let wired = 0;
  for (const t of source) {
    if (!t.wp_parent) continue;
    const child = idOf.get(key(t.taxonomy, t.wp_term_id));
    const parent = idOf.get(key(t.taxonomy, t.wp_parent));
    if (!child || !parent || currentParent.get(child) === parent) continue;
    const { error } = await db.from("cns_library_terms").update({ parent_id: parent }).eq("id", child);
    if (error) fail(`parent wiring: ${error.message}`);
    wired++;
  }

  log(`  parents wired: ${wired}`);
  const roots = source.filter((t) => t.taxonomy === "category" && !t.wp_parent).length;
  log(`  top-level categories: ${roots}\n`);
}

// ---------------------------------------------------------------------------
// posts
// ---------------------------------------------------------------------------
async function posts() {
  const source = readCache("posts").slice(0, LIMIT === Infinity ? undefined : LIMIT);
  const users = new Map(readCache("users").map((u) => [u.id, decode(u.name)]));
  const media = new Map(
    readCache("media").map((m) => [m.id, { url: m.source_url, alt: decode(m.alt_text) }])
  );
  const taxonomies = readCache("taxonomies");
  const forPosts = Object.keys(taxonomies).filter((k) => (taxonomies[k].types ?? []).includes("post"));

  const termRows = await readAll("cns_library_terms", "id,taxonomy,wp_term_id");
  const termId = new Map(termRows.map((r) => [`${r.taxonomy}:${r.wp_term_id}`, r.id]));
  if (!termRows.length) fail("No terms imported yet — run the terms phase first.");

  const existing = await readAll("cns_library_articles", "id,wp_post_id,slug");
  const known = new Map(existing.map((r) => [r.wp_post_id, r.id]));
  const usedSlugs = new Set(existing.map((r) => r.slug));

  log(`\n  ${source.length} posts in cache, ${known.size} already imported`);

  const fresh = [];
  for (const p of source) {
    if (known.has(p.id)) continue;

    const body_html = cleanBody(p.content?.rendered);
    const body_text = toText(body_html);

    // WordPress slugs are unique per post_type, and we index slug globally so
    // /library/<slug> resolves to exactly one article. Collisions are rare but
    // real; suffix with the source id so the result is stable across re-runs
    // rather than depending on insert order.
    let slug = p.slug || slugify(p.title?.rendered);
    if (usedSlugs.has(slug)) slug = `${slug}-${p.id}`;
    usedSlugs.add(slug);

    const featured = media.get(p.featured_media);

    fresh.push({
      row: {
        slug,
        title: decode(p.title?.rendered) || "Untitled",
        // toText BEFORE decode. WordPress returns excerpt.rendered as HTML
        // ("<p>Nursing case study on…</p>"), and decode() only turns entities
        // back into characters — it does not strip tags. Without the strip,
        // every card on the site renders a literal "<p>" in front of the
        // summary.
        excerpt: decode(toText(p.excerpt?.rendered)) || null,
        body_html,
        body_text,
        featured_image_url: featured?.url ?? null,
        featured_image_alt: featured?.alt || null,
        author_name: users.get(p.author) ?? null,
        seo_title: decode(p.yoast_head_json?.title) || null,
        seo_description: decode(p.yoast_head_json?.description) || null,
        // 200 wpm is the usual reading-speed constant for prose.
        reading_minutes: Math.max(1, Math.round(body_text.split(" ").length / 200)),
        status: "published",
        wp_post_id: p.id,
        wp_post_type: p.type ?? "post",
        wp_permalink: p.link ?? null,
        published_at: p.date_gmt ? `${p.date_gmt}Z` : null,
        import_batch_id: BATCH_ID,
      },
      // Every taxonomy this post belongs to. The REST post object exposes each
      // taxonomy as an array of term ids under its own key ('categories',
      // 'tags', or the custom taxonomy's rest_base).
      wpTerms: forPosts.flatMap((key) => {
        const restBase = taxonomies[key].rest_base ?? key;
        const ids = p[restBase] ?? p[key] ?? [];
        const taxName = key === "post_tag" ? "tag" : key;
        return (Array.isArray(ids) ? ids : []).map((id) => `${taxName}:${id}`);
      }),
    });
  }

  log(`  ${fresh.length} new articles to insert`);
  if (DRY) {
    const rels = fresh.reduce((n, f) => n + f.wpTerms.length, 0);
    return log(`  --dry-run: would insert ${fresh.length} articles, ${rels} term links\n`);
  }

  if (fresh.length) {
    // 200, not the 500 default. Median body is 5.5k characters, so 500 rows is
    // a ~2.75MB request — close enough to gateway body limits that a 413 part
    // way through a 9,000-row import is a real risk. 200 keeps it near 1MB.
    log("  inserting articles");
    await insertChunked("cns_library_articles", fresh.map((f) => f.row), 200);
  }

  // Relationships, resolved after insert so every article has an id. Upsert on
  // the composite primary key — a real (non-partial) index, so unlike the term
  // table this one PostgREST can genuinely conflict-target.
  const idByWp = new Map(
    (await readAll("cns_library_articles", "id,wp_post_id")).map((r) => [r.wp_post_id, r.id])
  );

  const links = [];
  let orphaned = 0;
  for (const f of fresh) {
    const articleId = idByWp.get(f.row.wp_post_id);
    if (!articleId) continue;
    for (const k of f.wpTerms) {
      const t = termId.get(k);
      if (!t) { orphaned++; continue; }
      links.push({ article_id: articleId, term_id: t });
    }
  }

  log(`  ${links.length} term links`);
  if (orphaned) log(`  WARNING: ${orphaned} term references had no matching term — re-run terms`);
  if (links.length) {
    await insertChunked("cns_library_article_terms", links, 1000, {
      onConflict: "article_id,term_id",
      ignoreDuplicates: true,
    });
  }

  // A count refresh that fails must NOT fail the import. Every article and
  // every relationship is already committed at this point; the counts are
  // derived data that a second command can rebuild. Exiting non-zero here once
  // made a completely successful 9,244-row import look like a failed one.
  //
  // It does need saying loudly, though: with the counts at zero, navigation
  // renders no sections at all and the library looks empty.
  const { error } = await db.rpc("cns_library_refresh_term_counts");
  if (error) {
    log(`\n  WARNING: term counts NOT refreshed — ${error.message}`);
    log("  The import itself succeeded. Rebuild the counts with:");
    log("      node scripts/library-refresh-counts.mjs");
    log("  Until then /library renders no sections.\n");
  } else {
    log("  term counts refreshed\n");
  }
}

// ---------------------------------------------------------------------------
// media
// ---------------------------------------------------------------------------
function r2Client() {
  const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"]
    .filter((k) => !env[k]);
  if (missing.length) fail(`R2 is not configured. Missing ${missing.join(", ")}`);
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
}

async function media() {
  const host = new URL(WP).host;
  // Matches http(s) URLs on the WordPress host ending in an image extension.
  const imgRe = new RegExp(`https?://[^"'\\s)]*${host.replace(/\./g, "\\.")}[^"'\\s)]*?\\.(?:jpe?g|png|gif|webp|svg)`, "gi");

  // --- 1. collect -----------------------------------------------------------
  log("\n  [1/3] collecting image URLs from imported bodies");
  const articles = await readAll("cns_library_articles", "id,body_html,featured_image_url");
  const urls = new Set();
  for (const a of articles) {
    for (const m of String(a.body_html ?? "").matchAll(imgRe)) urls.add(m[0]);
    if (a.featured_image_url?.includes(host)) urls.add(a.featured_image_url);
  }
  log(`    ${urls.size} distinct images across ${articles.length} articles`);

  if (!DRY && urls.size) {
    await insertChunked(
      "cns_library_media",
      [...urls].map((u) => ({ source_url: u })),
      1000,
      { onConflict: "source_url", ignoreDuplicates: true }
    );
  }
  if (DRY) return log("\n  --dry-run: stopping after collect\n");

  // --- 2. transfer ----------------------------------------------------------
  const pending = await readAll("cns_library_media", "id,source_url", (q) => q.eq("status", "pending"));
  log(`\n  [2/3] transferring ${pending.length} files to R2`);
  const s3 = pending.length ? r2Client() : null;
  const bucket = env.R2_BUCKET;
  const publicBase = env.R2_PUBLIC_URL.replace(/\/+$/, "");
  let done = 0, failed = 0;

  for (const m of pending.slice(0, LIMIT === Infinity ? undefined : LIMIT)) {
    try {
      const res = await fetch(m.source_url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") ?? "application/octet-stream";

      // The source path is not unique enough on its own (WordPress happily
      // serves the same filename from different year/month folders), so the
      // key is hashed from the full URL. Same URL always yields the same key,
      // which is what makes a re-run overwrite rather than duplicate.
      const hash = createHash("sha1").update(m.source_url).digest("hex").slice(0, 16);
      const name = decodeURIComponent(new URL(m.source_url).pathname.split("/").pop() ?? "image");
      const key = `library/${hash}/${name}`;

      await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: buf, ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }));

      await db.from("cns_library_media").update({
        r2_key: key, r2_url: `${publicBase}/${key}`, content_type: contentType,
        bytes: buf.length, status: "done", error: null, updated_at: new Date().toISOString(),
      }).eq("id", m.id);
      done++;
    } catch (e) {
      // A dead image on the old host must not stop 20,000 healthy ones. Record
      // it and move on; the rewrite step simply leaves that URL alone.
      await db.from("cns_library_media").update({
        status: "failed", error: String(e.message ?? e), updated_at: new Date().toISOString(),
      }).eq("id", m.id);
      failed++;
    }
    process.stdout.write(`\r    ${done} transferred, ${failed} failed`);
  }
  if (pending.length) process.stdout.write("\n");

  // --- 3. rewrite -----------------------------------------------------------
  log("\n  [3/3] rewriting article bodies");
  const map = new Map(
    (await readAll("cns_library_media", "source_url,r2_url", (q) => q.eq("status", "done")))
      .map((m) => [m.source_url, m.r2_url])
  );

  let rewritten = 0;
  for (const a of articles) {
    let html = String(a.body_html ?? "");
    let featured = a.featured_image_url;
    let changed = false;

    for (const m of new Set([...html.matchAll(imgRe)].map((x) => x[0]))) {
      const to = map.get(m);
      if (!to) continue;
      html = html.split(m).join(to);
      changed = true;
    }
    if (featured && map.has(featured)) { featured = map.get(featured); changed = true; }
    if (!changed) continue;

    const { error } = await db.from("cns_library_articles")
      .update({ body_html: html, featured_image_url: featured, updated_at: new Date().toISOString() })
      .eq("id", a.id);
    if (error) fail(`rewrite ${a.id}: ${error.message}`);
    rewritten++;
    process.stdout.write(`\r    ${rewritten} articles rewritten`);
  }
  if (rewritten) process.stdout.write("\n");
  log("");
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------
/**
 * Reconcile against the WordPress database.
 *
 * The REST API is the content source because it renders shortcodes and blocks;
 * it is NOT a trustworthy census. A taxonomy registered with show_in_rest:false
 * is invisible to it, and a post excluded by a filter plugin simply never
 * appears — in both cases the crawl looks complete and is not.
 *
 * MySQL is the census. docs/library-import.md carries the three queries whose
 * output goes in .tmp-wp/db-counts.json; this compares them with what landed.
 * Optional: skipped with a note if the file is absent.
 */
function reconcileWithDb({ articles, links, byTax }) {
  if (!existsSync(cachePath("db-counts"))) {
    return log("\n  (no .tmp-wp/db-counts.json — DB reconciliation skipped)");
  }
  const db_ = JSON.parse(readFileSync(cachePath("db-counts"), "utf8"));
  log("\n  Reconciliation against MySQL\n  " + "-".repeat(44));

  const row = (label, source, landed) => {
    const ok = Number(source) === Number(landed);
    log(`  ${label.padEnd(30)} ${String(source).padStart(6)} ${String(landed).padStart(7)}  ${ok ? "ok" : "MISMATCH"}`);
    return ok;
  };

  log(`  ${"".padEnd(30)} ${"wp".padStart(6)} ${"library".padStart(7)}`);
  let clean = row("published posts", db_.posts ?? 0, articles);
  for (const [tax, n] of Object.entries(db_.terms ?? {})) {
    const ours = byTax[tax === "post_tag" ? "tag" : tax] ?? 0;
    clean = row(`terms: ${tax}`, n, ours) && clean;
  }
  if (db_.relationships != null) clean = row("post/term links", db_.relationships, links) && clean;

  if (!clean) {
    log("\n  A mismatch means the REST crawl did not see everything MySQL has.");
    log("  Check for a taxonomy with show_in_rest:false, then re-run: crawl --refresh");
  }
  return clean;
}

async function verify() {
  const cached = existsSync(cachePath("posts")) ? readCache("posts").length : null;

  const [articles, published, links, termRows, mediaRows] = await Promise.all([
    readAll("cns_library_articles", "id"),
    readAll("cns_library_articles", "id", (q) => q.eq("status", "published")),
    readAll("cns_library_article_terms", "article_id"),
    readAll("cns_library_terms", "id,taxonomy,parent_id,article_count"),
    readAll("cns_library_media", "id,status"),
  ]);

  const byTax = {};
  for (const t of termRows) byTax[t.taxonomy] = (byTax[t.taxonomy] ?? 0) + 1;
  const mediaBy = {};
  for (const m of mediaRows) mediaBy[m.status] = (mediaBy[m.status] ?? 0) + 1;

  log("\n  Library import\n  " + "-".repeat(44));
  log(`  posts crawled from WordPress   ${cached ?? "(no cache)"}`);
  log(`  articles in library            ${articles.length}`);
  log(`  published                      ${published.length}`);
  log(`  term links                     ${links.length}`);
  log(`  terms                          ${termRows.length}  ${JSON.stringify(byTax)}`);
  log(`  nested categories              ${termRows.filter((t) => t.parent_id).length}`);
  log(`  media                          ${JSON.stringify(mediaBy)}`);

  const uncategorised = articles.length - new Set(links.map((l) => l.article_id)).size;
  if (uncategorised) log(`\n  NOTE: ${uncategorised} articles carry no term at all`);
  if (cached && cached !== articles.length) {
    log(`\n  MISMATCH: ${cached} crawled vs ${articles.length} imported — re-run the posts phase`);
  }
  const empty = termRows.filter((t) => t.article_count === 0).length;
  if (empty) log(`  NOTE: ${empty} terms have no published articles`);

  reconcileWithDb({ articles: articles.length, links: links.length, byTax });
  log("");
}

// ---------------------------------------------------------------------------
await { crawl, terms, posts, media, verify }[phase]();

import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Library reads.
 *
 * ~9,200 articles imported from the legacy WordPress blog at unnhub.org, filed
 * under WordPress's own taxonomy (see supabase/migrations/cns_library.sql for
 * why the term model is shaped the way it is). Everything here is published
 * content a signed-in member may read in full.
 *
 * THE SHAPE OF THE SOURCE drives almost every decision below. It is not a flat
 * blog — it is a four-level reference tree:
 *
 *   Nursepedia > section > subsection > leaf
 *
 * with 579 categories, and every one of the ten sections holding ZERO articles
 * directly. All the content hangs off depth 2 and 3. So navigation runs on
 * subtree_count, never on article_count, and a category page lists everything
 * beneath it rather than only what is pinned to it.
 *
 * Every select NAMES ITS COLUMNS. cns_library_articles.body_html holds the
 * entire article, so a `select("*")` on a list page pulls megabytes of body
 * text to render a grid of titles. Postgres keeps those bodies in TOAST
 * storage, out of the main heap — they cost nothing until something asks for
 * them, and that discipline is what keeps the browse pages fast.
 */

const CARD_COLUMNS =
  "id,slug,title,excerpt,featured_image_url,featured_image_alt,author_name,reading_minutes,published_at";

const TERM_COLUMNS =
  "id,taxonomy,name,slug,description,parent_id,article_count,subtree_count";

export type LibraryTerm = {
  id: string;
  taxonomy: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  /** Articles filed directly on this term. Usually 0 above the leaves. */
  article_count: number;
  /** Articles anywhere in this term's subtree. What navigation uses. */
  subtree_count: number;
};

/**
 * A child term that also knows about ITS children — how many, and the first
 * few names. Both are resolved from the single term read the page already
 * does, so a grid of 48 cards still costs one query rather than 49.
 */
export type LibraryChild = LibraryTerm & {
  child_count: number;
  child_preview: string[];
};

export type LibraryCategory = LibraryTerm & { children: LibraryChild[] };

export type CategoryContext = {
  term: LibraryTerm;
  ancestors: LibraryTerm[];
  children: LibraryChild[];
  /**
   * True when this category contains other categories.
   *
   * An archive page lists sections and nothing else — browsing 1,585 articles
   * twenty-four at a time is not navigation, the subtopics are. 38 of the 455
   * non-empty categories are archives; the other 451 are leaves that list
   * their articles.
   */
  isArchive: boolean;
};

export type LibraryArticleCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  featured_image_url: string | null;
  featured_image_alt: string | null;
  author_name: string | null;
  reading_minutes: number | null;
  published_at: string | null;
};

export type LibraryArticle = LibraryArticleCard & {
  body_html: string | null;
  seo_title: string | null;
  seo_description: string | null;
  terms: LibraryTerm[];
};

export const PAGE_SIZE = 24;

/** Guards every walk over parent_id. The column permits a cycle; a cycle in a
 *  loop with no bound takes the request down. */
const MAX_DEPTH = 10;

/**
 * WordPress excerpts routinely end in an ellipsis marker and a "Continue
 * reading" tail that only made sense on the old theme. Stripped here rather
 * than in the importer, so the original stays intact in the database.
 */
function cleanExcerpt(text: string | null): string | null {
  if (!text) return null;
  const cut = text
    // Guard, not the fix. Excerpts are stored as plain text — the importer
    // strips tags before writing, and the 9,244 rows imported before it did
    // were repaired. This is here because the failure mode is a literal "<p>"
    // on every card in the library, too visible to leave to one layer.
    //
    // A LETTER is required after "<". The obvious /<[^>]*>/ is wrong for this
    // corpus and dangerous: clinical text is full of comparisons, and on
    // "temperature <37.8C and pulse >90" that pattern matches from "<" to the
    // next ">" and deletes the threshold. Nursing guidance must not lose a
    // number because of a display filter.
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/\s*\[(?:…|\.\.\.)\]\s*$/, "")
    .replace(/\s*Continue reading.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cut.length ? cut : null;
}

const toCard = (r: Record<string, unknown>): LibraryArticleCard => ({
  id: r.id as string,
  slug: r.slug as string,
  title: r.title as string,
  excerpt: cleanExcerpt((r.excerpt as string) ?? null),
  featured_image_url: (r.featured_image_url as string) ?? null,
  featured_image_alt: (r.featured_image_alt as string) ?? null,
  author_name: (r.author_name as string) ?? null,
  reading_minutes: (r.reading_minutes as number) ?? null,
  published_at: (r.published_at as string) ?? null,
});

/**
 * Every category term, in one paged read.
 *
 * 579 rows today, comfortably one page — but PostgREST caps a response at 1000
 * and this tree only grows. An unpaged read that silently stops at the cap
 * would drop whole branches out of the navigation, which is the failure mode
 * this codebase has hit before (see lib/cns/study.ts).
 */
async function getCategoryTerms(): Promise<LibraryTerm[]> {
  const supabase = await createClient();
  const out: LibraryTerm[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data } = await supabase
      .from("cns_library_terms")
      .select(TERM_COLUMNS)
      .eq("taxonomy", "category")
      .order("subtree_count", { ascending: false })
      .range(from, from + page - 1);
    const rows = (data ?? []) as LibraryTerm[];
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

/**
 * The categories the library front page browses by.
 *
 * NOT simply "terms with no parent". The real tree has a single root —
 * "Nursepedia" — plus an empty "Uncategorized", so a literal top-level listing
 * renders one card and buries all ten real sections a click away. So: drop
 * anything with no published articles beneath it, then collapse while the
 * level has exactly one node. On the current data that lands on the ten
 * sections; on a differently shaped tree it lands on whatever the first
 * branching level is, without a hardcoded depth.
 */
function resolveRoots(withContent: LibraryTerm[]): LibraryTerm[] {
  const present = new Set(withContent.map((t) => t.id));
  // A term whose parent was filtered out is a root too, or it would be
  // unreachable from anywhere.
  let roots = withContent.filter((t) => !t.parent_id || !present.has(t.parent_id));

  for (let i = 0; roots.length === 1 && i < MAX_DEPTH; i++) {
    const kids = withContent.filter((t) => t.parent_id === roots[0].id);
    if (!kids.length) break;
    roots = kids;
  }
  return roots;
}

export async function getBrowseRoots(): Promise<LibraryCategory[]> {
  const terms = (await getCategoryTerms()).filter((t) => t.subtree_count > 0);
  const childrenOf = (id: string) => terms.filter((t) => t.parent_id === id);
  const withCounts = (list: LibraryTerm[]): LibraryChild[] =>
    list.map((c) => {
      const kids = childrenOf(c.id).sort((a, b) => b.subtree_count - a.subtree_count);
      return { ...c, child_count: kids.length, child_preview: kids.slice(0, 3).map((k) => k.name) };
    });

  return resolveRoots(terms)
    .sort((a, b) => b.subtree_count - a.subtree_count)
    .map((r) => ({ ...r, children: withCounts(childrenOf(r.id)) }));
}

/**
 * One category with its breadcrumb trail and immediate children.
 *
 * Resolved from the single term read rather than by recursive queries — the
 * whole tree is 579 rows and already in memory.
 */
export async function getCategoryContext(slug: string): Promise<CategoryContext | null> {
  const terms = await getCategoryTerms();
  const term = terms.find((t) => t.slug === slug);
  if (!term) return null;

  const byId = new Map(terms.map((t) => [t.id, t]));
  const full: LibraryTerm[] = [];
  let parent = term.parent_id ? byId.get(term.parent_id) : undefined;
  for (let i = 0; parent && i < MAX_DEPTH; i++) {
    full.unshift(parent);
    parent = parent.parent_id ? byId.get(parent.parent_id) : undefined;
  }

  /**
   * Trim the trail to start at a browse root.
   *
   * The real tree has a single root, "Nursepedia", holding everything. The
   * index already collapses past it — /library lists the ten sections, not one
   * Nursepedia card — so a breadcrumb reading "Library / Nursepedia / Lab
   * Values" names a level the reader was never shown and cannot navigate back
   * to meaningfully. The sections belong directly under Library.
   *
   * Trimming rather than hardcoding a name: if the tree is ever re-rooted, the
   * breadcrumb follows whatever getBrowseRoots() decided to show.
   */
  const rootIds = new Set(resolveRoots(terms.filter((t) => t.subtree_count > 0)).map((r) => r.id));
  const firstRoot = full.findIndex((a) => rootIds.has(a.id));
  const ancestors = firstRoot >= 0 ? full.slice(firstRoot) : [];

  const children = terms
    .filter((t) => t.parent_id === term.id && t.subtree_count > 0)
    .sort((a, b) => b.subtree_count - a.subtree_count)
    .map((c) => {
      const kids = terms
        .filter((g) => g.parent_id === c.id && g.subtree_count > 0)
        .sort((a, b) => b.subtree_count - a.subtree_count);
      return { ...c, child_count: kids.length, child_preview: kids.slice(0, 3).map((k) => k.name) };
    });

  return { term, ancestors, children, isArchive: children.length > 0 };
}

/**
 * Articles pinned DIRECTLY to one category, ignoring its descendants.
 *
 * Only four categories need this — Gastrointestinal Medications (21),
 * Medication Safety (12), Case Studies (1) and Nursepedia (1) hold
 * sub-categories AND articles of their own, 35 in total. Every archive page
 * above them lists sections rather than articles, so without a route to these
 * they would be unreachable from anywhere in the site.
 */
export async function listArticlesDirectlyIn(
  termId: string,
  page = 1
): Promise<LibraryArticleCard[]> {
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;
  const { data } = await supabase
    .from("cns_library_articles")
    .select(`${CARD_COLUMNS},cns_library_article_terms!inner(term_id)`)
    .eq("status", "published")
    .eq("cns_library_article_terms.term_id", termId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  return ((data ?? []) as Record<string, unknown>[]).map(toCard);
}

/**
 * Articles in a category or anywhere beneath it, newest first.
 *
 * Delegates to cns_library_articles_in_subtree(). The recursion, the DISTINCT
 * and the ordering all have to happen server-side: a section holds no articles
 * directly, an article can sit under two nodes of the same subtree, and a page
 * cut before ordering gives a different result each time.
 */
export async function listArticlesInSubtree(
  termId: string,
  page = 1
): Promise<LibraryArticleCard[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("cns_library_articles_in_subtree", {
    p_term_id: termId,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  return ((data ?? []) as Record<string, unknown>[]).map(toCard);
}

/** One article and the terms it is filed under. */
export async function getArticle(slug: string): Promise<LibraryArticle | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cns_library_articles")
    .select(`${CARD_COLUMNS},body_html,seo_title,seo_description`)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!data) return null;

  const { data: links } = await supabase
    .from("cns_library_article_terms")
    .select(`cns_library_terms(${TERM_COLUMNS})`)
    .eq("article_id", data.id as string);

  // PostgREST returns the embedded term as a single object for this
  // many-to-one relation, but its type inference cannot prove the cardinality
  // and widens to an array. Normalise both shapes rather than asserting one —
  // an assertion that is wrong at runtime silently yields zero categories on
  // every article.
  type TermLink = { cns_library_terms: LibraryTerm | LibraryTerm[] | null };
  const terms = ((links ?? []) as unknown as TermLink[]).flatMap((l) => {
    const t = l.cns_library_terms;
    if (!t) return [];
    return Array.isArray(t) ? t : [t];
  });

  return {
    ...toCard(data as Record<string, unknown>),
    body_html: (data.body_html as string) ?? null,
    seo_title: (data.seo_title as string) ?? null,
    seo_description: (data.seo_description as string) ?? null,
    terms,
  };
}

/**
 * Weighted full-text search across title, excerpt and body.
 *
 * `websearch_to_tsquery` rather than `plainto_tsquery`: it understands quoted
 * phrases and OR, which is what a reader typing into a search box expects, and
 * it never throws on punctuation the way raw to_tsquery does.
 */
export async function searchArticles(query: string, page = 1): Promise<LibraryArticleCard[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;
  const { data } = await supabase
    .from("cns_library_articles")
    .select(CARD_COLUMNS)
    .eq("status", "published")
    .textSearch("search_vector", q, { type: "websearch" })
    .range(from, from + PAGE_SIZE - 1);
  return ((data ?? []) as Record<string, unknown>[]).map(toCard);
}

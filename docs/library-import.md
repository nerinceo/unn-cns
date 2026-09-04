# WordPress → Library import

Runbook for moving ~9,000 published posts from the legacy WordPress blog into
the CNS library, with their categorisation intact.

**Decisions this build reflects**

| | |
|---|---|
| Lives in | CNS (`d:\2026\unn-cns`), members-only for now |
| Source | `https://unnhub.org` — REST API for content, MySQL for reconciliation |
| Scope | `post_type='post'`, `status='publish'` only |
| Images | Rehosted to R2 during the import |
| Publishing | Everything imported as `published` |
| Old URLs | Nothing indexed, so no redirect map is needed |

---

## What is actually in the source

Measured against the live REST API on 2026-09-02:

| | |
|---|---|
| Published posts | **9,244** (all dated 2026, all by one author) |
| Categories | **579**, hierarchical, **four levels deep** |
| Tags | **17,011** |
| Term links to insert | **72,144** (9,264 category + 62,880 tag) |
| Body text | 49.5 MB total; 1.2k–17.9k chars, median 5.5k |
| Images | **none at all** — 0 featured, 0 inline `<img>` |
| Yoast/RankMath SEO meta | none |
| Custom taxonomies on `post` | none — only `category` and `post_tag` |
| Custom post types | none beyond WordPress core |
| Slug collisions | none; no empty slugs |

Body HTML is unusually clean: `h2`, `p`, `ul`, `li`, `em` and nothing else. No
Gutenberg wrapper divs, no `wp-block-*` classes, no tables, no embeds.

A full sanitize pass over all 9,244 posts was measured to lose **zero** visible
text characters. 291 posts contain a literal `<` before a digit (clinical values
like `<37.8°C`); the sanitizer escapes these to `&lt;` rather than swallowing
them as a malformed tag, which was the one real risk in this corpus.

The tree is a structured reference work, not a blog roll:

```
Nursepedia                                  ← single root
├── Lab Values & Diagnostics    1,585 articles   (10 sub → ~25 each)
├── Procedures                  1,550           (49 sub)
├── Nursing Pharmacology        1,405           (17)
├── Medical Abbreviations       1,294           (26)
├── Case Studies                1,252           (29)
├── Disease & Conditions        1,047           (22)
├── Nursing Specialities          823            (7)
├── Nursing Sciences              131           (14)
├── Nursing Calculations           94            (9)
└── Fundamentals                   82           (11)
```

**Two facts here drive the whole design and are easy to get wrong:**

1. **Every section holds zero articles directly.** All 9,244 live at depth 2
   and 3. Any navigation built on a direct count renders ten empty sections and
   hides the library — which is why `cns_library_terms.subtree_count` exists
   and why category pages list the whole subtree via
   `cns_library_articles_in_subtree()`.
2. **There is one real root.** A literal "top-level categories" listing shows
   one card (`Nursepedia`) plus an empty `Uncategorized`. `getBrowseRoots()`
   drops empty branches and then collapses while a level has a single node, so
   it lands on the ten sections without hardcoding a depth.

17,011 tags against 9,244 posts is nearly two per post and mostly unique, so
tags are imported for fidelity but deliberately do **not** drive navigation —
they render as chips on the article and nothing else.

---

## Why the schema looks like it does

WordPress does not store a category on a post. It stores three tables:

```
wp_terms              term_id, name, slug
wp_term_taxonomy      term_taxonomy_id, term_id, taxonomy, parent, count
wp_term_relationships object_id (post) → term_taxonomy_id
```

Which means a post has **many** categories, categories **nest**, `taxonomy`
is a **discriminator** shared by categories, tags and custom taxonomies, and
every term has its **own** slug and description.

`cns_library_terms` + `cns_library_article_terms` mirror that one-for-one. The
alternative — a `categories text[]` column on the article — loses the nesting,
the descriptions, and the ability to browse a category at all.

Two traps worth knowing before you touch it:

- **Slugs are unique per taxonomy, not globally.** A `Pharmacology` category
  and a `pharmacology` tag both exist happily in WordPress. Hence
  `unique(taxonomy, slug)` and the `/library/category/…` vs `/library/tag/…`
  route split.
- **Terms must be inserted parent-last.** WordPress returns terms in arbitrary
  order, so the importer inserts every term with `parent_id = null`, then wires
  parents in a second pass. A single pass fails the foreign key on any child
  that arrives before its parent.

Full reasoning is in the migration header:
[cns_library.sql](../supabase/migrations/cns_library.sql).

---

## What was built

| File | |
|---|---|
| [supabase/migrations/cns_library.sql](../supabase/migrations/cns_library.sql) | 4 tables, RLS, FTS, `cns_library_refresh_term_counts()`, `cns_library_articles_in_subtree()` |
| [scripts/import-wordpress.mjs](../scripts/import-wordpress.mjs) | 5-phase importer |
| [scripts/library-refresh-counts.mjs](../scripts/library-refresh-counts.mjs) | Client-side count rebuild — fallback for the SQL function |
| [lib/cns/library.ts](../lib/cns/library.ts) | Reads: browse roots, category context, subtree listings, article, search |
| [app/(member)/library/](<../app/(member)/library/>) | Browse by section, category pages, article page |
| [components/library/ArticleGrid.tsx](../components/library/ArticleGrid.tsx) | Shared card grid |

`/library` was already in `MEMBER_MORE` nav — no nav change needed.

---

## Running it

### 0. Environment

Add to `.env` (CNS repo root):

```
WP_SITE_URL=https://unnhub.org
# Only if the REST API is restricted. Verified open for reads on 2026-09-02,
# so these are almost certainly unnecessary.
WP_USER=
WP_APP_PASSWORD=
```

`SUPABASE_SERVICE_ROLE_KEY` must be set. The five `R2_*` variables are **not**
needed — this corpus has no images (see step 5). The importer never logs a
credential. `.tmp-wp/` is covered by the existing `.tmp-*` gitignore rule.

### 1. Migration

Paste [cns_library.sql](../supabase/migrations/cns_library.sql) into
**Supabase Dashboard → SQL Editor** and run it. It is re-runnable. The trailing
`select` should report policies present, `authed_can_select = true` and
`anon_can_select = false`.

### 2. Crawl

```bash
node scripts/import-wordpress.mjs crawl
```

Writes `.tmp-wp/*.json` and touches nothing in Supabase. It prints the
`X-WP-Total` header WordPress reports — **expect 9,244 posts, 579 categories and
17,011 tags.** Anything materially lower means the crawl was throttled or
filtered; re-run with `--refresh` before importing. Re-running otherwise skips
cached files.

The tag crawl is the slow part (171 pages at 100 per request). A full crawl
takes about four minutes end to end.

**Already done once** — `.tmp-wp/` in the CNS repo holds the 2026-09-02 crawl
(73 MB). Re-run with `--refresh` to pick up anything published since.

It discovers taxonomies from `/wp-json/wp/v2/taxonomies` rather than assuming
`category` + `post_tag`, so a custom taxonomy comes across too.

### 3. Terms

```bash
node scripts/import-wordpress.mjs terms --dry-run
node scripts/import-wordpress.mjs terms
```

Expect **17,590** terms (579 categories + 17,011 tags) and 2 top-level
categories. The parent-wiring pass should report roughly 577 — every category
except the two roots. If it reports far fewer, the tree is flat and something
went wrong; stop before importing 9,244 posts against it.

### 4. Posts

```bash
node scripts/import-wordpress.mjs posts --limit=50   # smoke test
```

Open a few articles at `/library` and check the body renders, headings survive,
images appear (still on the old host at this point) and categories are right.
Then:

```bash
node scripts/import-wordpress.mjs posts
```

Idempotent — it re-reads which `wp_post_id`s already exist and inserts only the
gap, so an interrupted run is resumed by running it again.

### 5. Media → R2 — **not needed for this corpus**

```bash
node scripts/import-wordpress.mjs media
```

**Skip this.** The crawl found zero images: no featured images and no inline
`<img>` in any of the 9,244 bodies. The phase is a no-op and none of the `R2_*`
variables are required for this import.

The code stays because the library is not frozen — if illustrated articles are
added later, this phase collects image URLs, transfers them to R2 and rewrites
the bodies, in three resumable sub-steps. A dead image on the source host is
recorded as `failed` and skipped rather than stopping the run; query
`cns_library_media where status='failed'` afterwards.

Note for that future run: `srcset` and `sizes` are stripped at sanitize time.
WordPress emits four or five resized variants per image, and keeping them would
multiply the transfer by roughly five for no benefit — Cloudflare resizes in
front of R2, and the `src` WordPress puts in rendered content is already a
display size.

### 6. Verify

```bash
node scripts/import-wordpress.mjs verify
```

### Term counts, and the `pg-safeupdate` trap

Counts are derived data, rebuilt after every import. Two ways to do it:

```bash
node scripts/library-refresh-counts.mjs --dry-run   # shows the top categories
node scripts/library-refresh-counts.mjs
```

or `select public.cns_library_refresh_term_counts();` in the SQL editor.

**Supabase runs the `pg-safeupdate` extension**, which aborts any `UPDATE`
issued through the API that carries no `WHERE` clause. Both updates in
`cns_library_refresh_term_counts()` genuinely intend to touch every row, so
they carry `where t.id is not null` — a no-op qual on a NOT NULL primary key
purely to satisfy the extension. `where true` is **not** a safe substitute; the
planner can fold it away before the extension sees it. Do not tidy these away.

The first import hit exactly this: all 9,244 articles and 72,144 links
committed fine, then the refresh failed with `UPDATE requires a WHERE clause`,
leaving every count at zero and `/library` rendering no sections at all. The
importer now warns instead of exiting non-zero, and
`scripts/library-refresh-counts.mjs` computes the same numbers client-side as a
fallback that needs nothing but the tables.

---

## Reconciling against MySQL

The REST API renders content well but is **not** a reliable census: a taxonomy
registered with `show_in_rest: false` is invisible to it, and a filter plugin
can quietly exclude posts. The crawl looks complete either way.

Run these three against the WordPress database, put the results in
`.tmp-wp/db-counts.json`, and `verify` will diff them against what landed.

```sql
-- published posts
SELECT COUNT(*) FROM wp_posts
 WHERE post_type = 'post' AND post_status = 'publish';

-- terms per taxonomy. Any taxonomy here that the crawl did not list is one
-- REST is hiding.
SELECT tt.taxonomy, COUNT(*) AS n
  FROM wp_term_taxonomy tt
 GROUP BY tt.taxonomy;

-- post→term links on published posts
SELECT COUNT(*)
  FROM wp_term_relationships tr
  JOIN wp_posts p ON p.ID = tr.object_id
 WHERE p.post_type = 'post' AND p.post_status = 'publish';
```

`.tmp-wp/db-counts.json`:

```json
{
  "posts": 9014,
  "terms": { "category": 148, "post_tag": 2310 },
  "relationships": 31402
}
```

Adjust the `wp_` prefix if the install uses a custom one.

---

## Making it public later

Members-only was a deliberate call, and reversing it is not a schema change.
Two steps, both written out at the foot of
[cns_library.sql](../supabase/migrations/cns_library.sql):

1. Grant `anon` select and add three `to anon` policies scoped to
   `status = 'published'` (with no `cns_is_staff()` branch — `auth.uid()` is
   null for anon).
2. Add `/library` to `PUBLIC_PATHS` in [middleware.ts](../middleware.ts) with a
   reason comment, and add the library URLs to [app/sitemap.ts](../app/sitemap.ts).

`cns_library_media` stays staff-only in both worlds.

---

## Known limits

- **Tag archive pages are not built.** All 17,011 tags import and display on the
  article as chips, but `/library/tag/<slug>` has no route. With ~2 tags per
  post and most of them unique, tag archives would mostly be one-article pages;
  add the route the same way as the category page only if that changes.
- **124 empty categories** exist in the source. They import (fidelity), but
  `getBrowseRoots()` and the child rails hide anything with
  `subtree_count = 0`, so they never appear in navigation.
- **`Uncategorized`** — WordPress's default bucket, currently empty, so it is
  hidden. If posts land in it later it will surface as a section.
- **Search has no pagination UI.** `searchArticles()` accepts a page argument
  but the page renders only the first 24 results.
- **Cards are text-only**, because the source has no images. `ArticleGrid`
  renders the thumbnail block only when `featured_image_url` is set, so the
  cards degrade to title + excerpt + meta rather than leaving a grey gap.
- **Every article is dated 2026** and has one author, so "Recently added" and
  date ordering carry little signal. Subtree listings order by
  `published_at desc, id` — the id tiebreaker is what keeps pagination stable
  across 9,244 posts sharing a narrow date range.
- **No triage pass.** Everything imports as `published` by decision. The
  `status` column supports `draft`/`review`/`archived` for later, and outdated
  clinical guidance is the realistic reason to use it.

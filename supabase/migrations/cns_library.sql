-- ---------------------------------------------------------------------------
-- Library: imported WordPress articles, with their taxonomy preserved.
--
-- ~9,000 published posts come across from the legacy WordPress blog. The
-- requirement is that they stay categorised EXACTLY as WordPress had them, so
-- this schema mirrors WordPress's own taxonomy model rather than inventing a
-- simpler one.
--
-- WordPress stores categorisation in three tables:
--   wp_terms              term_id, name, slug
--   wp_term_taxonomy      term_taxonomy_id, term_id, taxonomy, parent, count
--   wp_term_relationships object_id (post) -> term_taxonomy_id
--
-- Four properties fall out of that, and none of them survive being flattened
-- into a text[] column on the article:
--   1. many-to-many  — one post sits in several categories
--   2. categories nest via `parent`; tags do not
--   3. `taxonomy` is a discriminator — category, post_tag and any custom
--      taxonomy all share one term table
--   4. terms carry their own slug and description, because each one has an
--      archive page
--
-- So: one term table with a taxonomy discriminator and a self-referencing
-- parent, plus one join table. That is a lossless mirror of the source.
--
-- ISOLATION. Every object here is cns_library_-prefixed and there is NOT ONE
-- foreign key into an existing table — not even public.users. The WordPress
-- author is a name string, not an UNN account, and a library that references
-- nothing outside itself cannot break anything when it is reshaped later.
-- Dropping this entire migration would leave the rest of CNS untouched.
--
-- VISIBILITY. Members-only for now, by decision. CNS middleware is fail-closed
-- so /library is already gated; this migration keeps the database half
-- consistent by granting `authenticated` only and explicitly revoking `anon`.
-- See "GOING PUBLIC LATER" at the foot of this file — it is a two-step change
-- and neither step is a schema migration.
--
-- Re-runnable.
-- ---------------------------------------------------------------------------

-- --- terms -----------------------------------------------------------------
create table if not exists public.cns_library_terms (
  id uuid default uuid_generate_v4() primary key,

  -- 'category' | 'tag' | whatever custom taxonomy the source site registered.
  -- Deliberately free text with NO check constraint, for the same reason
  -- cns_study_questions.source_question_type is free text: we do not control
  -- the source vocabulary. A CHECK listing only ('category','tag') would make
  -- the importer fail — or worse, silently skip — every post filed under a
  -- custom taxonomy, which is exactly the categorisation we are here to
  -- preserve. The importer sets this from /wp-json/wp/v2/taxonomies.
  taxonomy text not null default 'category',

  name text not null,
  slug text not null,
  description text,

  -- Category nesting. SET NULL rather than CASCADE: deleting a parent category
  -- must never silently delete the child categories under it, and through them
  -- the only route to a few hundred articles.
  parent_id uuid references public.cns_library_terms(id) on delete set null,

  -- Denormalised count of PUBLISHED articles filed DIRECTLY on this term.
  -- Refreshed by cns_library_refresh_term_counts(). Not premature optimisation
  -- — it is what WordPress itself does in wp_term_taxonomy.count, for the same
  -- reason: the browse page needs a count next to every term, and computing
  -- them live means an aggregate over the whole relationship table per view.
  article_count int not null default 0,

  -- The same count including every DESCENDANT category.
  --
  -- This is the one navigation actually uses, and the source data is why. The
  -- unnhub.org tree is four levels deep — Nursepedia > section > subsection >
  -- leaf — and every one of the ten sections has a direct count of ZERO: all
  -- 9,244 articles hang off depth 2 and 3. A browse page driven by
  -- article_count would show ten empty sections and hide the entire library.
  --
  -- Counted DISTINCT: an article filed under two nodes of the same subtree is
  -- one article, not two.
  subtree_count int not null default 0,

  -- Provenance and idempotency. The WordPress term id is stable, so a re-import
  -- updates rather than duplicates.
  wp_term_id int,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Scoped by taxonomy, NOT globally unique on slug. A "Pharmacology" category
-- and a "pharmacology" tag legally coexist in WordPress and routinely do; a
-- bare unique(slug) would reject one of them at import. Routes namespace them
-- the same way WordPress does: /library/category/x vs /library/tag/x.
create unique index if not exists cns_library_terms_slug_idx
  on public.cns_library_terms(taxonomy, slug);

-- Also scoped by taxonomy: wp_terms.term_id is unique per TERM, but one term
-- can be attached to two taxonomies (a row per term_taxonomy_id), so the REST
-- API can legitimately hand back a category and a tag sharing an id.
create unique index if not exists cns_library_terms_wp_idx
  on public.cns_library_terms(taxonomy, wp_term_id) where wp_term_id is not null;

create index if not exists cns_library_terms_parent_idx
  on public.cns_library_terms(taxonomy, parent_id);

-- --- articles --------------------------------------------------------------
create table if not exists public.cns_library_articles (
  id uuid default uuid_generate_v4() primary key,

  slug text not null,
  title text not null,
  excerpt text,

  -- Sanitized rendered HTML, not Markdown. The source is 9,000 posts of
  -- arbitrary WordPress HTML — tables, embeds, callouts, figure/figcaption.
  -- Converting that to Markdown loses structure irreversibly, and we would be
  -- converting it back to HTML to render it anyway.
  --
  -- Large values live in TOAST storage, out of the main heap, so this column
  -- costs nothing on a query that does not select it. The risk here is not
  -- size, it is a list query written as select('*') — always name columns.
  body_html text,

  -- Plain text of the same body. Feeds search and reading time. Stored rather
  -- than stripped on the fly because the FTS index below is a generated column
  -- and cannot call a non-immutable HTML stripper.
  body_text text,

  featured_image_url text,
  featured_image_alt text,

  -- The WordPress author, as a name. No FK to public.users on purpose: these
  -- people mostly do not have UNN accounts, and creating shell accounts for
  -- them would put thousands of fictional users into the platform.
  author_name text,

  seo_title text,
  seo_description text,
  reading_minutes int,

  -- The import publishes everything (decision: no triage pass), but the column
  -- stays so an individual article can be pulled or revised later without a
  -- schema change. Outdated clinical guidance is the realistic reason one gets
  -- archived.
  status text not null default 'draft'
    check (status in ('draft','review','published','archived')),

  -- Provenance. Nothing on the old site is indexed, so no redirect map is
  -- needed — the permalink is kept for traceability, for when an import looks
  -- wrong and someone has to go and read the original.
  wp_post_id int,
  wp_post_type text default 'post',
  wp_permalink text,

  published_at timestamptz,
  import_batch_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Weighted full-text search. A title match must outrank a passing mention in
  -- paragraph forty, hence setweight.
  --
  -- body_text is truncated into the vector because a tsvector is capped at
  -- roughly 1MB and an INSERT that exceeds it fails outright. No blog post
  -- reaches 500k characters, so this changes no real result — it just means a
  -- pathological row degrades its own search instead of aborting the import.
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('english', left(coalesce(body_text, ''), 500000)), 'C')
  ) stored
);

create unique index if not exists cns_library_articles_slug_idx
  on public.cns_library_articles(slug);
create unique index if not exists cns_library_articles_wp_idx
  on public.cns_library_articles(wp_post_id) where wp_post_id is not null;

-- The list query: published, newest first.
create index if not exists cns_library_articles_feed_idx
  on public.cns_library_articles(status, published_at desc nulls last);
create index if not exists cns_library_articles_search_idx
  on public.cns_library_articles using gin(search_vector);

-- --- article <-> term ------------------------------------------------------
create table if not exists public.cns_library_article_terms (
  article_id uuid not null references public.cns_library_articles(id) on delete cascade,
  term_id uuid not null references public.cns_library_terms(id) on delete cascade,
  primary key (article_id, term_id)
);

-- The primary key indexes (article_id, term_id), which answers "which terms is
-- this article filed under". The reverse — "which articles are in this
-- category", i.e. every category page — needs its own index or it is a
-- sequential scan over every relationship in the library.
create index if not exists cns_library_article_terms_term_idx
  on public.cns_library_article_terms(term_id, article_id);

-- --- media map -------------------------------------------------------------
-- Every image referenced by an imported post, mapped from its WordPress URL to
-- its R2 URL.
--
-- This table exists so the transfer is RESUMABLE. Nine thousand posts pull
-- thousands of images; that job will be interrupted, and without a durable
-- per-file record the only options on restart are re-downloading everything or
-- guessing what already made it across.
--
-- It is also why the library survives WordPress being switched off. An article
-- whose <img src> still points at the old host is a broken article the day
-- that host goes away.
create table if not exists public.cns_library_media (
  id uuid default uuid_generate_v4() primary key,
  source_url text not null unique,
  r2_key text,
  r2_url text,
  content_type text,
  bytes bigint,
  status text not null default 'pending'
    check (status in ('pending','done','failed','skipped')),
  error text,
  wp_media_id int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists cns_library_media_status_idx
  on public.cns_library_media(status);

-- Safe to re-run against a database that already has an older version of this
-- table, from before subtree_count existed.
alter table public.cns_library_terms
  add column if not exists subtree_count int not null default 0;

-- --- term counts -----------------------------------------------------------
-- Correlated subqueries rather than UPDATE ... FROM aggregates: the aggregate
-- form joins away every term with zero published articles, so a category that
-- has just been emptied would keep its stale count forever.
--
-- NOTE THE `where ... is not null` ON BOTH UPDATES. They are not filters — they
-- are there to satisfy Supabase's pg-safeupdate extension, which aborts any
-- UPDATE issued through the API that has no WHERE clause:
--   "term counts: UPDATE requires a WHERE clause"
-- Both statements genuinely intend to touch every row, so the qual is written
-- against a NOT NULL primary key and excludes nothing. `where true` is not a
-- safe substitute — it can be optimised away before the extension sees it.
-- Do not "tidy" these away.
create or replace function public.cns_library_refresh_term_counts()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.cns_library_terms t
     set article_count = (
           select count(*)::int
             from public.cns_library_article_terms at
             join public.cns_library_articles a on a.id = at.article_id
            where at.term_id = t.id
              and a.status = 'published'
         ),
         updated_at = now()
   where t.id is not null;

  -- Roll the direct counts up the tree. `tree` pairs every term with itself
  -- and each of its descendants; the depth guard is not decoration — a cycle
  -- in parent_id (which the schema permits) would otherwise recurse forever
  -- and take the import down with it.
  with recursive tree as (
    select id as root, id as node, 0 as depth
      from public.cns_library_terms
    union all
    select tr.root, c.id, tr.depth + 1
      from tree tr
      join public.cns_library_terms c on c.parent_id = tr.node
     where tr.depth < 10
  ),
  tally as (
    select tr.root, count(distinct at.article_id)::int as n
      from tree tr
      join public.cns_library_article_terms at on at.term_id = tr.node
      join public.cns_library_articles a
        on a.id = at.article_id and a.status = 'published'
     group by tr.root
  )
  update public.cns_library_terms t
     set subtree_count = coalesce((select n from tally where tally.root = t.id), 0)
   where t.id is not null;
end;
$$;

-- --- subtree listing -------------------------------------------------------
-- Every published article in a category OR any category beneath it.
--
-- Needed because the sections a reader clicks hold no articles directly. Doing
-- it in SQL rather than resolving descendant ids in the app and passing them
-- to `in(...)` buys the two things the app cannot do: DISTINCT (an article
-- filed under two nodes of one subtree must appear once) and ORDER BY applied
-- BEFORE the page is cut, so pagination is stable.
--
-- SECURITY INVOKER, so the caller's RLS still applies — this returns published
-- rows to a member and nothing at all to anon.
create or replace function public.cns_library_articles_in_subtree(
  p_term_id uuid,
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  id uuid,
  slug text,
  title text,
  excerpt text,
  featured_image_url text,
  featured_image_alt text,
  author_name text,
  reading_minutes int,
  published_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with recursive tree as (
    select cns_library_terms.id, 0 as depth
      from public.cns_library_terms
     where cns_library_terms.id = p_term_id
    union all
    select c.id, tr.depth + 1
      from tree tr
      join public.cns_library_terms c on c.parent_id = tr.id
     where tr.depth < 10
  )
  select distinct
         a.id, a.slug, a.title, a.excerpt, a.featured_image_url,
         a.featured_image_alt, a.author_name, a.reading_minutes, a.published_at
    from public.cns_library_articles a
    join public.cns_library_article_terms at on at.article_id = a.id
   where at.term_id in (select tree.id from tree)
     and a.status = 'published'
   order by a.published_at desc nulls last, a.id
   limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

grant execute on function public.cns_library_articles_in_subtree(uuid, int, int) to authenticated;

-- A new function is EXECUTE-able by PUBLIC unless told otherwise. This one is
-- SECURITY DEFINER and rewrites every row of a table, so close it to everyone
-- and open it only to the importer, which runs as service_role.
revoke execute on function public.cns_library_refresh_term_counts() from public;
revoke execute on function public.cns_library_refresh_term_counts() from anon;
revoke execute on function public.cns_library_refresh_term_counts() from authenticated;
grant execute on function public.cns_library_refresh_term_counts() to service_role;

-- --- RLS -------------------------------------------------------------------
alter table public.cns_library_terms enable row level security;
alter table public.cns_library_articles enable row level security;
alter table public.cns_library_article_terms enable row level security;
alter table public.cns_library_media enable row level security;

-- Supabase grants SELECT to anon by default on new public-schema tables. RLS
-- would already deny it (there is no anon policy below), but revoking the
-- grant as well makes going public later an explicit, reviewable act rather
-- than something a stray policy could switch on by accident.
revoke all on public.cns_library_terms from anon;
revoke all on public.cns_library_articles from anon;
revoke all on public.cns_library_article_terms from anon;
revoke all on public.cns_library_media from anon;

-- Terms are a navigation vocabulary, not content: any signed-in member reads
-- the whole tree. An empty category is still worth showing — it tells a reader
-- the section exists.
drop policy if exists "cns library terms read" on public.cns_library_terms;
create policy "cns library terms read"
  on public.cns_library_terms for select to authenticated
  using (true);

drop policy if exists "cns library terms write" on public.cns_library_terms;
create policy "cns library terms write"
  on public.cns_library_terms for all to authenticated
  using (public.cns_is_staff()) with check (public.cns_is_staff());

drop policy if exists "cns library articles read" on public.cns_library_articles;
create policy "cns library articles read"
  on public.cns_library_articles for select to authenticated
  using (status = 'published' or public.cns_is_staff());

drop policy if exists "cns library articles write" on public.cns_library_articles;
create policy "cns library articles write"
  on public.cns_library_articles for all to authenticated
  using (public.cns_is_staff()) with check (public.cns_is_staff());

-- Relationship rows inherit the article's visibility. Without the EXISTS test
-- this table would leak the existence and categorisation of unpublished
-- articles — the row is only two uuids, but it is still a disclosure.
drop policy if exists "cns library article terms read" on public.cns_library_article_terms;
create policy "cns library article terms read"
  on public.cns_library_article_terms for select to authenticated
  using (
    exists (
      select 1 from public.cns_library_articles a
       where a.id = article_id
         and (a.status = 'published' or public.cns_is_staff())
    )
  );

drop policy if exists "cns library article terms write" on public.cns_library_article_terms;
create policy "cns library article terms write"
  on public.cns_library_article_terms for all to authenticated
  using (public.cns_is_staff()) with check (public.cns_is_staff());

-- Operational bookkeeping — staff only. A member never needs to know where an
-- image came from; they see the rewritten URL in the article body.
drop policy if exists "cns library media staff" on public.cns_library_media;
create policy "cns library media staff"
  on public.cns_library_media for all to authenticated
  using (public.cns_is_staff()) with check (public.cns_is_staff());

-- ---------------------------------------------------------------------------
-- GOING PUBLIC LATER
--
-- Nothing here needs to change structurally. To make the library crawlable,
-- with the same justification /jobs and /employers/ already carry:
--
--   1. Database — grant anon read of published articles and of the taxonomy:
--
--        grant select on public.cns_library_articles,
--                        public.cns_library_terms,
--                        public.cns_library_article_terms to anon;
--
--        create policy "cns library articles read anon"
--          on public.cns_library_articles for select to anon
--          using (status = 'published');
--        create policy "cns library terms read anon"
--          on public.cns_library_terms for select to anon using (true);
--        create policy "cns library article terms read anon"
--          on public.cns_library_article_terms for select to anon
--          using (exists (select 1 from public.cns_library_articles a
--                          where a.id = article_id and a.status = 'published'));
--
--      Note the anon policies say `status = 'published'` with NO staff branch:
--      cns_is_staff() reads auth.uid(), which is null for anon.
--
--   2. Application — add "/library" to PUBLIC_PATHS in middleware.ts with a
--      reason comment, and add the library URLs to app/sitemap.ts.
--
-- cns_library_media stays staff-only in both worlds.
-- ---------------------------------------------------------------------------

-- --- verification ----------------------------------------------------------
select
  (select count(*) from pg_policies where tablename like 'cns_library%') as policy_count,
  has_table_privilege('authenticated', 'public.cns_library_articles', 'SELECT') as authed_can_select,
  has_table_privilege('anon', 'public.cns_library_articles', 'SELECT') as anon_can_select;

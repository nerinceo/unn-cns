-- ============================================================================
-- CNS Jobs — full-text search, ranking, pagination and two new filters
-- ----------------------------------------------------------------------------
-- Additive + idempotent. Run in Supabase Dashboard > SQL Editor.
-- Touches CNS tables only (cns_jobs). No HUB table is altered.
--
-- WHY THIS EXISTS
--
--   listPublishedJobs() was `.limit(50)` ordered by published_at with an ilike
--   over title/description/city. Three problems, in order of how much they hurt:
--
--   1. NO PAGINATION. The board silently truncated at 50 rows. Once there are
--      more than 50 active jobs, roles 51+ are unreachable by any UI path.
--   2. NO RANKING. A nurse searching "ICU Bangalore" got the newest 50 that
--      matched, not the best. Recency is not relevance.
--   3. THE SEARCH LIED. Its own comment claimed it covered "title, employer,
--      city, specialty and description". It covered title, description and
--      city. Searching a hospital by name returned nothing — the single most
--      obvious query on a job board.
--
--   A tsvector + GIN index fixes 2 and 3 properly and makes 1 cheap. The
--   employer name cannot live in a generated column (it is on another table
--   and a generated expression may not reference one), so the RPC joins
--   cns_employers and ORs an ilike over the name. That keeps a hospital
--   rename correct with no trigger to drift.
--
-- SECURITY
--
--   cns_search_jobs is SECURITY INVOKER (the default — deliberately NOT
--   definer). RLS on cns_jobs therefore still applies to the caller, and the
--   body additionally pins status = 'active', so a draft, submitted or
--   rejected posting can never leak through the search path regardless of who
--   calls it.
-- ============================================================================

-- 1. New filter columns --------------------------------------------------------
-- Visa sponsorship is the single most load-bearing fact for an internationally
-- educated nurse, and it was not capturable at all: a UK ward job that will
-- sponsor and one that will not were indistinguishable until the interview.
alter table public.cns_jobs
  add column if not exists visa_sponsorship boolean not null default false;

comment on column public.cns_jobs.visa_sponsorship is
  'Employer-stated: will this role sponsor a work visa / certificate of sponsorship.';

-- 2. Search vector -------------------------------------------------------------
-- Weighted so a title hit outranks a body hit. to_tsvector with an EXPLICIT
-- regconfig is immutable, which a generated column requires; the one-argument
-- form is not and would be rejected here.
--
-- NOTE: specialty, nursing_role and country hold taxonomy VALUES (slugs), not
-- display labels. Indexing the value is what makes /jobs?q=icu work; the label
-- lives in cns_job_categories and is not duplicated here on purpose.
alter table public.cns_jobs
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english',
      coalesce(specialty, '') || ' ' || coalesce(nursing_role, '')), 'B') ||
    setweight(to_tsvector('english',
      coalesce(city, '') || ' ' || coalesce(state, '') || ' ' ||
      coalesce(country, '') || ' ' || coalesce(work_setting, '')), 'C') ||
    setweight(to_tsvector('english',
      coalesce(description, '') || ' ' || coalesce(responsibilities, '') || ' ' ||
      coalesce(qualifications, '')), 'D')
  ) stored;

create index if not exists cns_jobs_search_tsv_idx
  on public.cns_jobs using gin (search_tsv);

-- Supports the published_at tiebreak and the "posted within N days" filter.
create index if not exists cns_jobs_active_published_idx
  on public.cns_jobs (published_at desc) where status = 'active';

-- Employer-name matching is an ilike; without trigram support it is a scan.
-- pg_trgm ships with Supabase, but guard it so a restricted project still
-- applies the rest of this file.
do $$
begin
  create extension if not exists pg_trgm;
  create index if not exists cns_employers_name_trgm_idx
    on public.cns_employers using gin (name gin_trgm_ops);
exception when insufficient_privilege then
  raise notice 'pg_trgm unavailable; employer-name search falls back to a scan';
end $$;

-- 3. Search RPC ----------------------------------------------------------------
-- One round trip returns the page AND the unpaginated total, via count(*)
-- over(). Doing that as a second query would race: a job published between the
-- two calls makes the footer disagree with the list.
--
-- Deliberately absent: a salary filter and a salary sort. salary_min/max are
-- stored in the employer's own currency (INR, GBP, AED...) with no normalised
-- column, so ordering or thresholding across them compares 40000 INR against
-- 40000 GBP and silently ranks the worse-paid job higher. That needs a
-- normalised monthly-equivalent column written at save time — a real piece of
-- work, not a WHERE clause, and shipping the broken version would be worse
-- than not shipping it.
create or replace function public.cns_search_jobs(
  p_q               text    default null,
  p_country         text[]  default null,
  p_role            text[]  default null,
  p_specialty       text[]  default null,
  p_employment_type text[]  default null,
  p_work_setting    text[]  default null,
  p_experience      text[]  default null,
  p_posted_within   int     default null,
  p_sponsorship     boolean default null,
  p_remote          boolean default null,
  p_sort            text    default 'relevance',
  p_limit           int     default 20,
  p_offset          int     default 0
)
returns table (job jsonb, total_count bigint)
language sql
stable
as $$
  with q as (
    select
      case
        when coalesce(btrim(p_q), '') = '' then null
        else websearch_to_tsquery('english', p_q)
      end                                as tsq,
      nullif(btrim(coalesce(p_q, '')), '') as raw
  ),
  matched as (
    select
      -- search_tsv is large and of no use to a client; strip it rather than
      -- ship a lexeme blob down the wire on every card.
      --
      -- Named job_row, NOT job: this function is RETURNS TABLE (job jsonb,
      -- total_count bigint), and in a language-sql function those output names
      -- are in scope in the body. A CTE column also called `job` makes a bare
      -- reference ambiguous.
      to_jsonb(j) - 'search_tsv'            as job_row,
      j.application_deadline                as deadline,
      coalesce(j.published_at, j.created_at) as posted_at,
      case
        when (select tsq from q) is null then 0::real
        -- ts_rank is (tsvector, tsquery) — the reverse does not exist, and
        -- Postgres reports it as "function ts_rank(tsquery, tsvector) does not
        -- exist" rather than as an argument-order mistake.
        else ts_rank(j.search_tsv, (select tsq from q))
      end                                    as match_rank
    from public.cns_jobs j
    join public.cns_employers e on e.id = j.employer_id
    where j.status = 'active'
      and (p_country         is null or j.country         = any (p_country))
      and (p_role            is null or j.nursing_role    = any (p_role))
      and (p_specialty       is null or j.specialty       = any (p_specialty))
      and (p_employment_type is null or j.employment_type = any (p_employment_type))
      and (p_work_setting    is null or j.work_setting    = any (p_work_setting))
      and (p_experience      is null or j.experience_level = any (p_experience))
      and (p_sponsorship     is null or j.visa_sponsorship = p_sponsorship)
      and (p_remote          is null or j.is_remote        = p_remote)
      and (
        p_posted_within is null
        or coalesce(j.published_at, j.created_at) >= now() - make_interval(days => p_posted_within)
      )
      and (
        (select tsq from q) is null
        or j.search_tsv @@ (select tsq from q)
        -- Employer name: the query a nurse actually types ("Apollo", "NHS").
        or e.name ilike '%' || (select raw from q) || '%'
      )
  )
  select
    m.job_row        as job,
    -- Computed before LIMIT, so this is the FULL match count, not the page's.
    count(*) over () as total_count
  from matched m
  order by
    case when p_sort = 'relevance' then m.match_rank end desc nulls last,
    case when p_sort = 'closing'   then m.deadline   end asc  nulls last,
    m.posted_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- anon included on purpose: /jobs is crawlable and must work signed out, which
-- is what earns the JobPosting rich results. The function reads nothing an
-- anonymous visitor could not already read directly from cns_jobs.
grant execute on function public.cns_search_jobs(
  text, text[], text[], text[], text[], text[], text[], int, boolean, boolean, text, int, int
) to anon, authenticated;

-- 4. Verify --------------------------------------------------------------------
select 'active jobs' as check, count(*)::text as value from public.cns_jobs where status = 'active'
union all
select 'indexed (search_tsv not null)', count(*)::text from public.cns_jobs where search_tsv is not null
union all
select 'rpc smoke (first page)', count(*)::text from public.cns_search_jobs(p_limit => 20);

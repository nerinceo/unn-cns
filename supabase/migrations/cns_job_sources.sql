-- ---------------------------------------------------------------------------
-- Imported job listings (2026-10-09). Re-runnable.
--
-- Nursing and healthcare roles pulled from licensed job APIs (Adzuna, Jooble),
-- hospital careers boards (Greenhouse, Lever) and roles staff add by hand.
--
--   1. Provenance on cns_jobs: source, source_id, source_job_id, source_url ...
--      Every imported role is apply_mode='external' — the employer is not on
--      Nerusalem, so an in-app application would reach nobody.
--   2. Stub employers: cns_employers.is_stub. An imported role needs an
--      employer row; it gets an unverified stub, never a real employer's row
--      (that would read as the hospital having posted it here).
--   3. cns_job_sources + cns_job_import_runs. Service role only. API keys live
--      in env vars, never in these rows.
--   4. The status guard lets ONLY the service role write imported rows, and
--      only rows that are not native. Native roles keep every existing rule.
--      Nobody but staff and the importer can set or change provenance.
--   5. cns_search_jobs: native roles rank above imported ones.
--
-- Run BEFORE deploying the CNS code that reads these columns. Additive and
-- cns_-scoped. No HUB or UHN object is touched.
-- ---------------------------------------------------------------------------

-- 1. Sources -----------------------------------------------------------------
create table if not exists public.cns_job_sources (
  id uuid default uuid_generate_v4() primary key,
  kind text not null,
  -- Shown on every role as "Via <name>". For an aggregator, the aggregator's
  -- name (its terms require the credit); for a careers board, the hospital's.
  name text not null,
  -- Per-kind settings: country, keywords, board token, company name.
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default false,
  auto_publish boolean not null default true,
  max_per_run int not null default 200,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cns_job_sources drop constraint if exists cns_job_sources_kind_check;
alter table public.cns_job_sources add constraint cns_job_sources_kind_check
  check (kind in ('adzuna', 'jooble', 'greenhouse', 'lever', 'manual'));
alter table public.cns_job_sources drop constraint if exists cns_job_sources_max_check;
alter table public.cns_job_sources add constraint cns_job_sources_max_check
  check (max_per_run between 1 and 1000);

create table if not exists public.cns_job_import_runs (
  id uuid default uuid_generate_v4() primary key,
  source_id uuid references public.cns_job_sources(id) on delete cascade not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched int not null default 0,
  inserted int not null default 0,
  updated int not null default 0,
  skipped int not null default 0,
  closed int not null default 0,
  error text
);
create index if not exists cns_job_import_runs_source_idx
  on public.cns_job_import_runs (source_id, started_at desc);

-- RLS on with NO policies: only the service role reads or writes these. The
-- admin screens check staff first, then read with the service role.
alter table public.cns_job_sources enable row level security;
alter table public.cns_job_import_runs enable row level security;
revoke all on public.cns_job_sources from anon, authenticated;
revoke all on public.cns_job_import_runs from anon, authenticated;

-- 2. Provenance on roles -----------------------------------------------------
alter table public.cns_jobs add column if not exists source text not null default 'native';
alter table public.cns_jobs add column if not exists source_id uuid
  references public.cns_job_sources(id) on delete set null;
alter table public.cns_jobs add column if not exists source_name text;
alter table public.cns_jobs add column if not exists source_job_id text;
alter table public.cns_jobs add column if not exists source_url text;
alter table public.cns_jobs add column if not exists imported_at timestamptz;
alter table public.cns_jobs add column if not exists last_seen_at timestamptz;
alter table public.cns_jobs add column if not exists dedupe_key text;

alter table public.cns_jobs drop constraint if exists cns_jobs_source_check;
alter table public.cns_jobs add constraint cns_jobs_source_check
  check (source in ('native', 'adzuna', 'jooble', 'greenhouse', 'lever', 'manual'));

-- An imported role always has its upstream id and always applies off-site.
alter table public.cns_jobs drop constraint if exists cns_jobs_imported_shape;
alter table public.cns_jobs add constraint cns_jobs_imported_shape check (
  source = 'native'
  or (source_job_id is not null and apply_mode = 'external' and source_name is not null)
);

-- The importer's upsert key. A FULL unique index (not partial) because
-- PostgREST's on_conflict cannot name a partial one; native rows have a NULL
-- source_job_id and NULLs never collide.
create unique index if not exists cns_jobs_source_uid
  on public.cns_jobs (source, source_job_id);
create index if not exists cns_jobs_dedupe_idx
  on public.cns_jobs (dedupe_key) where dedupe_key is not null;
create index if not exists cns_jobs_source_seen_idx
  on public.cns_jobs (source_id, status, last_seen_at) where source <> 'native';

-- 3. Stub employers ----------------------------------------------------------
alter table public.cns_employers add column if not exists is_stub boolean not null default false;
-- Normalised company name, so "AIIMS, Delhi" and "Aiims Delhi" are one stub.
alter table public.cns_employers add column if not exists stub_key text;
create unique index if not exists cns_employers_stub_key_uid
  on public.cns_employers (stub_key);

-- SELECT on cns_employers is a per-column grant (0064 section 9). is_stub must
-- be readable so public pages can say "not on Nerusalem yet" and the sitemap
-- can leave stubs out. stub_key stays private.
grant select (is_stub) on public.cns_employers to anon, authenticated;

-- An organisation cannot mark itself a stub (that would drop it from the
-- sitemap) or un-stub an imported one. Staff and the importer can.
create or replace function public.cns_employers_guard_stub()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.cns_is_staff() or coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_stub := false;
    new.stub_key := null;
  else
    new.is_stub := old.is_stub;
    new.stub_key := old.stub_key;
  end if;
  return new;
end;
$$;

drop trigger if exists cns_employers_guard_stub_trg on public.cns_employers;
create trigger cns_employers_guard_stub_trg
  before insert or update on public.cns_employers
  for each row execute function public.cns_employers_guard_stub();

-- 4. Status guard ------------------------------------------------------------
--
-- Identical to cns_jobs_launch_fixes.sql except for the two blocks marked
-- "Imported listings". The function is SECURITY DEFINER, so current_user is
-- the owner, not the caller — the service role is recognised from the JWT.
create or replace function public.cns_jobs_guard_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Staff may do anything; the admin queue is the point of this table.
  if public.cns_is_staff() then
    return new;
  end if;

  -- Imported listings: the importer (service role) publishes and refreshes
  -- them without review, which is what the source on/off and auto-publish
  -- switches in /admin/job-sources control. Never a native role, and never
  -- turning a native role into an imported one.
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     and new.source is distinct from 'native'
     and (tg_op = 'INSERT' or old.source is distinct from 'native') then
    return new;
  end if;

  -- Imported listings: provenance is not the employer's to set.
  if tg_op = 'INSERT' then
    new.source := 'native';
    new.source_id := null;
    new.source_name := null;
    new.source_job_id := null;
    new.source_url := null;
    new.imported_at := null;
    new.last_seen_at := null;
    new.dedupe_key := null;
  else
    new.source := old.source;
    new.source_id := old.source_id;
    new.source_name := old.source_name;
    new.source_job_id := old.source_job_id;
    new.source_url := old.source_url;
    new.imported_at := old.imported_at;
    new.last_seen_at := old.last_seen_at;
    new.dedupe_key := old.dedupe_key;
  end if;

  if tg_op = 'INSERT' then
    -- Employers always start in draft, whatever the client asked for.
    if new.status is distinct from 'draft' then
      new.status := 'draft';
    end if;
    new.published_at := null;
    new.reviewed_by  := null;
    new.reviewed_at  := null;
    new.pending_changes := null;
    new.pending_submitted_at := null;
    return new;
  end if;

  -- Review metadata belongs to the reviewer, not the employer.
  new.published_at := old.published_at;
  new.reviewed_by  := old.reviewed_by;
  new.reviewed_at  := old.reviewed_at;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'draft'             and new.status = 'submitted')
      or (old.status = 'changes_requested' and new.status in ('draft', 'submitted'))
      or (old.status = 'submitted'         and new.status = 'draft')
      or (old.status = 'active'            and new.status in ('paused', 'closed'))
      or (old.status = 'paused'            and new.status in ('active', 'closed'))
      -- Expiry. cns_close_expired_jobs() (the daily cron) runs as the service
      -- role, which is not "staff", so without this the cron itself was refused
      -- and roles past their deadline stayed live for months (found
      -- 2026-10-08). Only a role whose deadline has really passed may expire.
      or (old.status in ('active', 'paused') and new.status = 'expired'
          and new.application_deadline is not null
          and new.application_deadline < current_date)
    ) then
      raise exception
        'A job cannot be moved from % to % by an employer. Nerusalem reviews every posting.',
        old.status, new.status
        using errcode = '42501';
    end if;
  end if;

  -- A role that has been approved keeps its approved content. Every column a
  -- reviewer reads is frozen for the employer; the change goes through
  -- pending_changes and staff apply it.
  if old.status in ('active', 'paused') and (
       new.title, new.description, new.responsibilities, new.qualifications,
       new.employment_type, new.nursing_role, new.specialty, new.work_setting,
       new.experience_level, new.is_remote, new.work_mode,
       new.country, new.state, new.city, new.street_address, new.postal_code,
       new.experience_min_years, new.qualification_required, new.license_required,
       new.language_requirements, new.salary_min, new.salary_max, new.salary_currency,
       new.salary_period, new.salary_undisclosed, new.salary_text,
       new.apply_mode, new.external_apply_url, new.visa_sponsorship
     ) is distinct from (
       old.title, old.description, old.responsibilities, old.qualifications,
       old.employment_type, old.nursing_role, old.specialty, old.work_setting,
       old.experience_level, old.is_remote, old.work_mode,
       old.country, old.state, old.city, old.street_address, old.postal_code,
       old.experience_min_years, old.qualification_required, old.license_required,
       old.language_requirements, old.salary_min, old.salary_max, old.salary_currency,
       old.salary_period, old.salary_undisclosed, old.salary_text,
       old.apply_mode, old.external_apply_url, old.visa_sponsorship
     ) then
    raise exception
      'Changes to a live role are reviewed by Nerusalem before they go public.'
      using errcode = '42501';
  end if;

  -- pending_changes means nothing on a role that is not live.
  if new.status not in ('active', 'paused') then
    new.pending_changes := null;
    new.pending_submitted_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists cns_jobs_guard_status_trg on public.cns_jobs;
create trigger cns_jobs_guard_status_trg
  before insert or update on public.cns_jobs
  for each row execute function public.cns_jobs_guard_status();

-- 5. Search: native roles first ----------------------------------------------
--
-- Identical to cns_jobs_launch_fixes.sql except the first ORDER BY key and
-- the internal columns dropped from the output. A role posted by a reviewed
-- employer, with in-app apply, outranks an imported listing on every sort.
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
      -- LIKE metacharacters escaped: a search for "%" matched every employer.
      replace(replace(replace(nullif(btrim(coalesce(p_q, '')), ''),
        '\', '\\'), '%', '\%'), '_', '\_') as raw
  ),
  matched as (
    select
      -- Named job_row, NOT job: RETURNS TABLE output names are in scope here.
      to_jsonb(j) - 'search_tsv' - 'pending_changes' - 'dedupe_key' - 'source_id'
        as job_row,
      (j.source <> 'native')                as imported,
      j.application_deadline                as deadline,
      coalesce(j.published_at, j.created_at) as posted_at,
      case
        when (select tsq from q) is null then 0::real
        else ts_rank(j.search_tsv, (select tsq from q))
      end                                    as match_rank
    from public.cns_jobs j
    join public.cns_employers e on e.id = j.employer_id
    where j.status = 'active'
      and (j.application_deadline is null or j.application_deadline >= current_date)
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
        or e.name ilike '%' || (select raw from q) || '%'
      )
  )
  select
    m.job_row        as job,
    count(*) over () as total_count
  from matched m
  order by
    m.imported asc,
    case when p_sort = 'relevance' then m.match_rank end desc nulls last,
    case when p_sort = 'closing'   then m.deadline   end asc  nulls last,
    m.posted_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

grant execute on function public.cns_search_jobs(
  text, text[], text[], text[], text[], text[], text[], int, boolean, boolean, text, int, int
) to anon, authenticated;

-- --- verification --------------------------------------------------------
-- Expect: 8 provenance columns, 2 employer columns, both tables, both
-- triggers, and every existing role still native (last row: 0).
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'cns_jobs'
   and column_name in ('source', 'source_id', 'source_name', 'source_job_id',
                       'source_url', 'imported_at', 'last_seen_at', 'dedupe_key');
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'cns_employers'
   and column_name in ('is_stub', 'stub_key');
select tgname from pg_trigger
 where tgname in ('cns_jobs_guard_status_trg', 'cns_employers_guard_stub_trg');
select count(*) as non_native_before_first_import
  from public.cns_jobs where source <> 'native';

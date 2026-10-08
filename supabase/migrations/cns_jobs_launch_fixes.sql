-- ---------------------------------------------------------------------------
-- Job module launch fixes (2026-10-08 black-box run). Re-runnable.
--
--   1. cns_search_jobs: expired roles are no longer "open", and a "%" or "_"
--      typed into the search box is a literal, not a wildcard.
--   3. The expiry cron could not expire anything: the guard refused it.
--   2. Live roles: content edits wait for review (pending_changes) instead of
--      going public instantly — enforced here, not only in the app.
--
-- Run BEFORE deploying the CNS + UHN code that reads pending_changes.
-- Additive and cns_-scoped. No HUB object is touched.
-- ---------------------------------------------------------------------------

-- 1. Search ------------------------------------------------------------------
--
-- status='active' alone listed roles whose deadline had passed: those are only
-- flipped to 'expired' by the daily cron, and until then they were counted as
-- open, ranked first and applied to (and refused). The deadline is inclusive,
-- matching validThrough = <deadline>T23:59:59 in the JSON-LD.
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
      to_jsonb(j) - 'search_tsv' - 'pending_changes' as job_row,
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
    case when p_sort = 'relevance' then m.match_rank end desc nulls last,
    case when p_sort = 'closing'   then m.deadline   end asc  nulls last,
    m.posted_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

grant execute on function public.cns_search_jobs(
  text, text[], text[], text[], text[], text[], text[], int, boolean, boolean, text, int, int
) to anon, authenticated;

-- 2. Pending changes to live roles --------------------------------------------
--
-- An employer could retitle an approved role "guaranteed visa" and it went
-- public at once — the exact claim the review queue exists to stop. Edits to a
-- live (active or paused) role now go into pending_changes; the live columns
-- keep the approved text until staff accept the change. Deadline, vacancies
-- and the internal reference stay instant: none of them is a public claim the
-- review checks.
alter table public.cns_jobs add column if not exists pending_changes jsonb;
alter table public.cns_jobs add column if not exists pending_submitted_at timestamptz;

create index if not exists cns_jobs_pending_changes_idx
  on public.cns_jobs (pending_submitted_at)
  where pending_changes is not null;

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

-- --- verification --------------------------------------------------------
-- Expect: both columns present, the trigger present, and the search returning
-- no role past its deadline (the last row should read 0).
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'cns_jobs'
   and column_name in ('pending_changes', 'pending_submitted_at');
select tgname from pg_trigger
 where tgrelid = 'public.cns_jobs'::regclass and tgname = 'cns_jobs_guard_status_trg';
-- Closes what the cron should already have closed; returns how many.
select public.cns_close_expired_jobs() as expired_now;
select count(*) as expired_in_search
  from public.cns_search_jobs(p_limit => 100) s
 where (s.job->>'application_deadline')::date < current_date;

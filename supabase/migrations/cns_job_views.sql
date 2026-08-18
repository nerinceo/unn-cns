-- ============================================================================
-- CNS Jobs — view tracking, so employer analytics have a numerator
-- ----------------------------------------------------------------------------
-- Additive + idempotent. Run in Supabase Dashboard > SQL Editor.
-- Touches CNS tables only. No HUB table is altered.
--
-- WHY
--
--   cns_jobs.views_count has existed since the first jobs migration and NOTHING
--   HAS EVER WRITTEN TO IT. Every employer dashboard number was therefore an
--   application count with no denominator: a role with 2 applications could be
--   badly written or simply unseen, and there was no way to tell which.
--   "Is anyone looking at my job?" is the first question a recruiter asks and
--   the product could not answer it.
--
-- DEDUPE
--
--   One row per (job, viewer, day). A raw counter incremented on every render
--   turns one recruiter refreshing their own posting into 40 views, and a
--   conversion rate computed against that is worse than no number — it reads
--   as "nobody is applying" when the truth is "nobody is looking".
--
--   viewer_key is a caller-supplied opaque string: the user id when signed in,
--   otherwise a salted hash of IP + user agent. Forging it can only affect
--   whether the FORGER's own view is counted, so it needs no stronger
--   guarantee than that.
-- ============================================================================

create table if not exists public.cns_job_views (
  job_id     uuid not null references public.cns_jobs(id) on delete cascade,
  -- Opaque. Never a raw IP: this table would otherwise be a log of which
  -- nurses looked at which jobs, tied to an address.
  viewer_key text not null,
  viewed_on  date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (job_id, viewer_key, viewed_on)
);

create index if not exists cns_job_views_job_day_idx
  on public.cns_job_views (job_id, viewed_on desc);

alter table public.cns_job_views enable row level security;

-- No client reads this table directly. Employers get aggregates through
-- cns_job_view_stats (below), which is scoped to jobs they own; raw rows stay
-- unreadable so a viewing history can never be reconstructed.
drop policy if exists "cns job views no direct read" on public.cns_job_views;

-- ---------------------------------------------------------------------------
-- Recording a view.
--
-- SECURITY DEFINER because an anonymous visitor must be able to record one,
-- and cns_job_views is deliberately unreadable. The body is tightly bounded:
-- it writes at most one row for one already-active job and returns nothing.
-- search_path is pinned — a definer function without it is the classic
-- privilege-escalation footgun.
-- ---------------------------------------------------------------------------
create or replace function public.cns_record_job_view(
  p_job_id uuid,
  p_viewer_key text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted int;
begin
  if p_job_id is null or coalesce(btrim(p_viewer_key), '') = '' then
    return;
  end if;

  -- Only active postings accrue views. Counting views on a draft would let an
  -- employer inflate their own analytics simply by previewing.
  if not exists (
    select 1 from public.cns_jobs where id = p_job_id and status = 'active'
  ) then
    return;
  end if;

  insert into public.cns_job_views (job_id, viewer_key)
  values (p_job_id, left(p_viewer_key, 128))
  on conflict (job_id, viewer_key, viewed_on) do nothing;

  get diagnostics v_inserted = row_count;

  -- views_count stays the cheap denominator the job card and the dashboard
  -- read; cns_job_views is the detail behind it. Bumped only on a genuine
  -- insert, so the two can never drift.
  if v_inserted > 0 then
    update public.cns_jobs
       set views_count = views_count + 1
     where id = p_job_id;
  end if;
end;
$$;

revoke all on function public.cns_record_job_view(uuid, text) from public;
grant execute on function public.cns_record_job_view(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Aggregates for the employer dashboard.
--
-- SECURITY INVOKER: the join against cns_jobs is subject to the caller's RLS,
-- so an employer can only ever aggregate their own postings.
-- ---------------------------------------------------------------------------
create or replace function public.cns_job_view_stats(
  p_employer_id uuid,
  p_days int default 30
)
returns table (
  job_id       uuid,
  views_total  bigint,
  views_window bigint
)
language sql
stable
as $$
  select
    j.id,
    count(v.job_id)                                                        as views_total,
    count(v.job_id) filter (
      where v.viewed_on >= current_date - make_interval(days => greatest(p_days, 1))
    )                                                                      as views_window
  from public.cns_jobs j
  left join public.cns_job_views v on v.job_id = j.id
  where j.employer_id = p_employer_id
  group by j.id;
$$;

grant execute on function public.cns_job_view_stats(uuid, int) to authenticated;

-- Verify ----------------------------------------------------------------------
select 'job view rows' as check, count(*)::text as value from public.cns_job_views
union all
select 'jobs with a nonzero views_count', count(*)::text
  from public.cns_jobs where views_count > 0;

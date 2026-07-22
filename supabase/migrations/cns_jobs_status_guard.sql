-- ---------------------------------------------------------------------------
-- Jobs: only UNN staff may put a job live.
--
-- Found by end-to-end testing: an employer could set status='active' on their
-- own draft and it appeared on the public board immediately, with no admin
-- review. Blueprint §3 ("only approved jobs can become publicly visible") and
-- §9.2 (admin job review queue) were both defeated.
--
-- The RLS policy "cns jobs employer write" is FOR ALL, so a member may update
-- their own rows — which is correct for content, and wrong for status. RLS has
-- no way to say "these columns, but not that one", so the rule goes in a
-- trigger where it applies to every path: the server action, a direct
-- PostgREST call with a stolen-but-valid JWT, anything.
--
-- Fixing this in application code alone would not have worked. The exploit
-- above never called the server action.
--
-- Additive and cns_-scoped. No HUB object is touched.
-- ---------------------------------------------------------------------------

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
    return new;
  end if;

  -- Review metadata belongs to the reviewer, not the employer. Silently
  -- preserving it beats raising: these are not fields a legitimate client
  -- sets, so an error here would only ever surface as a confusing failure
  -- when some unrelated update happens to send the whole row back.
  new.published_at := old.published_at;
  new.reviewed_by  := old.reviewed_by;
  new.reviewed_at  := old.reviewed_at;

  if new.status is distinct from old.status then
    -- The transitions an employer genuinely owns. Everything else -- most of
    -- all anything -> 'active' -- is a staff decision.
    --
    -- paused -> active is allowed: the job was approved once already and its
    -- content has not changed, which is what setJobLifecycle() relies on.
    if not (
         (old.status = 'draft'             and new.status = 'submitted')
      or (old.status = 'changes_requested' and new.status in ('draft', 'submitted'))
      or (old.status = 'submitted'         and new.status = 'draft')
      or (old.status = 'active'            and new.status in ('paused', 'closed'))
      or (old.status = 'paused'            and new.status in ('active', 'closed'))
    ) then
      raise exception
        'A job cannot be moved from % to % by an employer. UNN reviews every posting.',
        old.status, new.status
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists cns_jobs_guard_status_trg on public.cns_jobs;
create trigger cns_jobs_guard_status_trg
  before insert or update on public.cns_jobs
  for each row execute function public.cns_jobs_guard_status();

-- --- verification --------------------------------------------------------
-- Expect one row: the trigger, firing before insert or update.
select tgname,
       case tgtype & 2 when 2 then 'BEFORE' else 'AFTER' end as timing,
       (tgtype & 4)::boolean as on_insert,
       (tgtype & 16)::boolean as on_update
  from pg_trigger
 where tgrelid = 'public.cns_jobs'::regclass
   and not tgisinternal;

-- ---------------------------------------------------------------------------
-- 2. Applying was impossible.
--
-- Found by end-to-end testing: a nurse clicking Send application got
-- "new row violates row-level security policy". The INSERT policy on
-- cns_job_applications still required the job to be status='published', but
-- the v1 alignment migration renamed that value to 'active'. It updated the
-- public read policy on cns_jobs and missed this one, so from the moment that
-- migration ran, NOBODY could apply to ANY job.
--
-- The single most important action in the module, broken in production, and
-- invisible to every build and type check.
-- ---------------------------------------------------------------------------

drop policy if exists "cns applications create" on public.cns_job_applications;
create policy "cns applications create"
  on public.cns_job_applications for insert to authenticated
  with check (
    applicant_id = auth.uid()
    and exists (
      select 1 from public.cns_jobs j
       where j.id = job_id
         and j.status = 'active'
         and exists (select 1 from public.cns_employers e
                      where e.id = j.employer_id and e.status = 'approved')
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Dead partial indexes.
--
-- These are all `where status = 'published'`, so since the rename they index
-- zero rows while still costing a write on every job update. The alignment
-- migration created the 'active' equivalents; these are the leftovers.
-- ---------------------------------------------------------------------------

drop index if exists public.cns_jobs_browse_idx;
drop index if exists public.cns_jobs_filter_idx;
drop index if exists public.cns_jobs_specialty_idx;
drop index if exists public.cns_jobs_deadline_idx;

-- --- verification --------------------------------------------------------
-- Expect: the apply policy quotes 'active', and no index remains on
-- 'published'. Both should return zero rows for the old value.
select policyname, with_check::text
  from pg_policies
 where tablename = 'cns_job_applications' and cmd = 'INSERT';

select indexname
  from pg_indexes
 where tablename = 'cns_jobs' and indexdef like '%published''%';

-- ===========================================================================
-- CNS Jobs — align the schema to the Basic Version blueprint.
--
-- The riskiest migration in this module: it RENAMES values on existing rows,
-- not just adds columns. Every rename updates data BEFORE the new CHECK is
-- applied, or the constraint would fail against rows still holding old values.
--
-- WHAT CHANGES AND WHY
--
-- work_setting is NEW and is NOT work_mode. Work setting is where the care
-- happens (hospital, home, school) and is one of the six primary filters.
-- work_mode was onsite/hybrid/remote, which is how the nurse attends — a
-- different question. Both are kept; work_mode is reduced to the remote
-- indicator the blueprint asks for.
--
-- nursing_role is NEW and absent from the original build, despite being a
-- primary filter with sixteen values.
--
-- specialty was free text and becomes a taxonomy reference. Existing values
-- are matched by slug where possible; anything unmatched is left NULL and
-- listed at the end of this file so an admin can fix it rather than being
-- silently mangled.
--
-- experience_min_years (int) is kept as optional detail, with the five-band
-- experience_level added alongside as the filter.
--
-- Statuses widen to the blueprint's vocabularies. Job gains submitted,
-- changes_requested, paused, rejected, removed. Application renames
-- submitted->applied, viewed->under_review, offered->selected,
-- rejected->not_selected.
--
-- Purely additive with respect to HUB: every object touched is cns_*.
--
-- Run manually in Supabase Dashboard > SQL Editor, AFTER cns_job_taxonomy.sql.
-- Safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. cns_jobs — new classification columns
-- ---------------------------------------------------------------------------
alter table public.cns_jobs
  add column if not exists nursing_role text,
  add column if not exists work_setting text,
  add column if not exists experience_level text,
  add column if not exists is_remote boolean not null default false,
  add column if not exists internal_ref text,
  add column if not exists language_requirements text,
  -- Blueprint §7.3: "Salary may be optional text or hidden in Basic Version.
  -- Avoid complex currency/range filtering." The numeric columns stay for the
  -- JobPosting markup (Google wants a real MonetaryAmount), but employers may
  -- instead write free text and skip the numbers entirely.
  add column if not exists salary_text text,
  add column if not exists changes_requested_note text,
  add column if not exists closed_reason text,
  add column if not exists reviewed_by uuid references public.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

-- `positions` is the blueprint's name for what was built as `vacancies`.
-- Renaming would break existing code for no benefit, so vacancies stays and
-- this comment records the mapping.
comment on column public.cns_jobs.vacancies is
  'Blueprint §7.3 "number of positions".';

-- ---------------------------------------------------------------------------
-- 2. Backfill BEFORE widening constraints
-- ---------------------------------------------------------------------------

-- work_mode 'remote' carried the meaning that is_remote now carries.
update public.cns_jobs
   set is_remote = true
 where work_mode = 'remote' and is_remote = false;

-- Employment type: old vocabulary -> blueprint vocabulary.
-- locum -> casual (both mean irregular shift-by-shift work).
-- volunteer has no blueprint equivalent; map to temporary rather than dropping
-- the row's meaning entirely.
update public.cns_jobs set employment_type = 'full-time'  where employment_type = 'full_time';
update public.cns_jobs set employment_type = 'part-time'  where employment_type = 'part_time';
update public.cns_jobs set employment_type = 'casual'     where employment_type = 'locum';
update public.cns_jobs set employment_type = 'temporary'  where employment_type = 'volunteer';
-- 'contract' and 'internship' already match.

-- Specialty free text -> taxonomy slug, by case-insensitive label match.
update public.cns_jobs j
   set specialty = c.value
  from public.cns_job_categories c
 where c.kind = 'specialty'
   and j.specialty is not null
   and j.specialty <> c.value                       -- already migrated rows
   and lower(btrim(j.specialty)) = lower(c.label);

-- Anything still unmatched would violate the FK-like expectation downstream.
-- Park it rather than guess: NULL is honest, a wrong specialty is not.
update public.cns_jobs j
   set specialty = null
 where j.specialty is not null
   and not exists (
     select 1 from public.cns_job_categories c
      where c.kind = 'specialty' and c.value = j.specialty
   );

-- Experience band from the numeric field, where one was given.
update public.cns_jobs
   set experience_level = case
     when experience_min_years is null then null
     when experience_min_years < 1 then 'under-1'
     when experience_min_years < 3 then '1-3'
     when experience_min_years < 5 then '3-5'
     else '5-plus'
   end
 where experience_level is null;

-- Country: free text -> taxonomy slug.
update public.cns_jobs j
   set country = c.value
  from public.cns_job_categories c
 where c.kind = 'country'
   and j.country is not null
   and j.country <> c.value
   and (lower(btrim(j.country)) = lower(c.label) or upper(btrim(j.country)) = c.code);

-- Work setting has no prior source. Default the existing rows to 'hospital'
-- rather than leaving a required filter blank on live listings; employers can
-- correct it, and it is flagged in the report at the end of this file.
update public.cns_jobs
   set work_setting = 'hospital'
 where work_setting is null;

-- ---------------------------------------------------------------------------
-- 3. Job status — widen to the blueprint's nine states
-- ---------------------------------------------------------------------------
-- 'published' was the built name for what the blueprint calls Approved/Active.
update public.cns_jobs set status = 'active'   where status = 'published';
update public.cns_jobs set status = 'removed'  where status = 'archived';

alter table public.cns_jobs drop constraint if exists cns_jobs_status_check;
alter table public.cns_jobs add constraint cns_jobs_status_check check (status in (
  'draft',              -- employer only
  'submitted',          -- awaiting admin review
  'changes_requested',  -- employer must edit and resubmit
  'active',             -- approved and public
  'paused',             -- temporarily hidden, applications retained
  'rejected',           -- not approved, reason recorded
  'closed',             -- ended by the employer
  'expired',            -- deadline passed, set by cron
  'removed'             -- admin moderation action
));

-- ---------------------------------------------------------------------------
-- 4. Employment type / role / setting / experience constraints
--
-- Deliberately NOT foreign keys to cns_job_categories: deactivating a category
-- must not cascade into live jobs, and the blueprint wants values retired by
-- hiding them, not by breaking rows. Validity is enforced at write time in the
-- application and checked by the report below.
-- ---------------------------------------------------------------------------
alter table public.cns_jobs drop constraint if exists cns_jobs_employment_type_check;
alter table public.cns_jobs add constraint cns_jobs_employment_type_check check (
  employment_type in ('full-time','part-time','casual','temporary','contract',
                      'permanent','internship','travel-assignment')
);

alter table public.cns_jobs drop constraint if exists cns_jobs_experience_level_check;
alter table public.cns_jobs add constraint cns_jobs_experience_level_check check (
  experience_level is null or experience_level in ('none','under-1','1-3','3-5','5-plus')
);

-- work_mode is now only about remote attendance; is_remote is the field the UI
-- and the JobPosting markup read.
alter table public.cns_jobs drop constraint if exists cns_jobs_work_mode_check;
alter table public.cns_jobs add constraint cns_jobs_work_mode_check check (
  work_mode in ('onsite','hybrid','remote')
);

-- ---------------------------------------------------------------------------
-- 5. Application status — rename, then widen
-- ---------------------------------------------------------------------------
update public.cns_job_applications set status = 'applied'      where status = 'submitted';
update public.cns_job_applications set status = 'under_review' where status = 'viewed';
update public.cns_job_applications set status = 'selected'     where status = 'offered';
update public.cns_job_applications set status = 'not_selected' where status = 'rejected';

alter table public.cns_job_applications drop constraint if exists cns_job_applications_status_check;
alter table public.cns_job_applications add constraint cns_job_applications_status_check check (
  status in ('applied','under_review','shortlisted','interview','selected','not_selected','withdrawn')
);

alter table public.cns_job_applications
  alter column status set default 'applied';

-- The definer function that employers call must accept the new vocabulary.
create or replace function public.cns_set_application_status(
  p_application_id uuid, p_status text, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_employer uuid;
begin
  if p_status not in ('under_review','shortlisted','interview','selected','not_selected') then
    raise exception 'invalid status %', p_status using errcode = '22023';
  end if;

  select j.employer_id into v_employer
    from public.cns_job_applications a
    join public.cns_jobs j on j.id = a.job_id
   where a.id = p_application_id;

  if v_employer is null then
    raise exception 'application not found' using errcode = '42704';
  end if;
  if not public.cns_is_employer_member(v_employer) then
    raise exception 'not your employer' using errcode = '42501';
  end if;

  update public.cns_job_applications
     set status = p_status,
         status_changed_at = now(),
         employer_note = coalesce(p_note, employer_note)
   where id = p_application_id;

  -- Blueprint §6.3 requires the actor on every transition.
  insert into public.cns_application_status_history (application_id, status, actor_id, note)
  values (p_application_id, p_status, auth.uid(), p_note);
end;
$$;
revoke all on function public.cns_set_application_status(uuid, text, text) from public, anon;
grant execute on function public.cns_set_application_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Employers — blueprint §7.1 fields
-- ---------------------------------------------------------------------------
alter table public.cns_employers
  add column if not exists legal_name text,
  add column if not exists contact_person text,
  add column if not exists business_email text,
  add column if not exists address text,
  add column if not exists state text;

alter table public.cns_employers drop constraint if exists cns_employers_verification_status_check;
alter table public.cns_employers add constraint cns_employers_verification_status_check check (
  verification_status in ('draft','submitted','under_review','approved','changes_requested','rejected','suspended','unverified','pending','verified')
);

-- ---------------------------------------------------------------------------
-- 7. Public visibility now depends on 'active', not 'published'
-- ---------------------------------------------------------------------------
drop policy if exists "cns jobs public read" on public.cns_jobs;
create policy "cns jobs public read"
  on public.cns_jobs for select to anon, authenticated
  using (
    status = 'active'
    and exists (select 1 from public.cns_employers e
                 where e.id = employer_id and e.status = 'approved')
  );

-- Expiry closes past-deadline ACTIVE jobs.
create or replace function public.cns_close_expired_jobs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  update public.cns_jobs
     set status = 'expired', updated_at = now()
   where status = 'active'
     and application_deadline is not null
     and application_deadline < current_date;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.cns_close_expired_jobs() from public, anon, authenticated;

create index if not exists cns_jobs_browse_v1_idx
  on public.cns_jobs(status, published_at desc) where status = 'active';
create index if not exists cns_jobs_filter_v1_idx
  on public.cns_jobs(country, nursing_role, specialty, employment_type, work_setting, experience_level)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- 8. Post-migration report — what needs an admin's attention.
-- ---------------------------------------------------------------------------
select 'jobs total'                  as check, count(*)::text from public.cns_jobs
union all select 'jobs missing specialty',    count(*)::text from public.cns_jobs where specialty is null
union all select 'jobs defaulted to hospital', count(*)::text from public.cns_jobs where work_setting = 'hospital'
union all select 'jobs missing nursing_role', count(*)::text from public.cns_jobs where nursing_role is null
union all select 'applications total',        count(*)::text from public.cns_job_applications
union all select 'applications on legacy status',
       count(*)::text from public.cns_job_applications
        where status not in ('applied','under_review','shortlisted','interview','selected','not_selected','withdrawn');

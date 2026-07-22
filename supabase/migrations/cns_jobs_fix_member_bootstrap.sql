-- ===========================================================================
-- FIX for cns_jobs.sql — the founding employer member could never be created.
--
-- The "cns employer members manage" policy gates INSERT on
-- cns_is_employer_member(employer_id), i.e. it requires the caller to ALREADY
-- be an approved member. For the first member of a new organisation that is
-- always false, so registerEmployer() silently created an employer with zero
-- members. The registrant was then locked out of their own organisation:
-- posting a job, reading applications and changing an application's status all
-- check membership and returned "not your employer".
--
-- It went unnoticed in testing only because the test account had been promoted
-- to platform staff, and every one of those policies also passes for staff.
--
-- Fix: allow a user to add THEMSELVES to an employer THEY created.
--
-- This grants no publishing power on its own — cns_employers.status remains
-- 'pending' until staff approve, and publishJob() enforces that separately.
--
-- Also backfills owners for any organisation already registered without one.
--
-- Purely additive. Only cns_* objects. Safe to re-run.
-- ===========================================================================

drop policy if exists "cns employer members bootstrap" on public.cns_employer_members;
create policy "cns employer members bootstrap"
  on public.cns_employer_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.cns_employers e
       where e.id = employer_id and e.created_by = auth.uid()
    )
  );

-- Backfill: any employer whose creator is not yet a member becomes owned by
-- its creator.
insert into public.cns_employer_members (employer_id, user_id, role, status)
select e.id, e.created_by, 'owner', 'approved'
  from public.cns_employers e
 where e.created_by is not null
   and not exists (
     select 1 from public.cns_employer_members m
      where m.employer_id = e.id and m.user_id = e.created_by
   )
on conflict (employer_id, user_id) do nothing;

select 'employers'         as entity, count(*) from public.cns_employers
union all
select 'employer members', count(*) from public.cns_employer_members;

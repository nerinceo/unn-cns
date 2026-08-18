-- ============================================================================
-- cns_employer_member_roles.sql — close the self-promotion hole on
-- cns_employer_members.
--
-- THE BUG. The existing policy is:
--
--   create policy "cns employer members manage"
--     on public.cns_employer_members for all to authenticated
--     using (public.cns_is_employer_member(employer_id) or public.cns_is_staff())
--     with check (...same...);
--
-- FOR ALL, with a membership test that does not look at `role`. So any approved
-- member — including an ordinary `recruiter` — can today:
--   * promote themselves to `owner`,
--   * delete the owner,
--   * add anyone they like to the organisation.
--
-- It is invisible only because no invite UI exists yet (settings/page.tsx says
-- "Inviting colleagues is not built yet"). That is not a mitigation, it is a
-- coincidence — a hand-crafted PostgREST call needs no UI. And an invite flow
-- now exists in UHN's organization portal, so the coincidence has run out.
--
-- THE FIX, in two parts, because neither alone is enough:
--   1. Narrow the policy so only an `owner` may write member rows.
--   2. Add a trigger, because RLS cannot express "you may update this row but
--      not its role column" — the same reason cns_jobs_guard_status() exists.
--
-- Safe to re-run. No data changes.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Is the caller an OWNER of this employer? (not merely a member)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.cns_is_employer_owner(p_employer uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.cns_employer_members m
     where m.employer_id = p_employer
       and m.user_id = auth.uid()
       and m.status = 'approved'
       and m.role = 'owner'
  );
$$;
revoke all on function public.cns_is_employer_owner(uuid) from public, anon;
grant execute on function public.cns_is_employer_owner(uuid) to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Split the policy.
--
-- Reading stays open to every member — a recruiter should see who else is in
-- the organisation. Writing narrows to owners and platform staff.
-- ────────────────────────────────────────────────────────────────────────────
drop policy if exists "cns employer members manage" on public.cns_employer_members;

create policy "cns employer members manage"
  on public.cns_employer_members for all to authenticated
  using (public.cns_is_employer_owner(employer_id) or public.cns_is_staff())
  with check (public.cns_is_employer_owner(employer_id) or public.cns_is_staff());


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Guard the role column.
--
-- Even restricted to owners, RLS cannot stop an owner from being removed by
-- another owner, nor stop anyone editing their OWN row. Both matter: an
-- organisation with no owner is unadministrable, and self-edit is how
-- escalation happens.
--
-- The bootstrap policy is deliberately left intact — a creator inserting their
-- own first `owner` row is the one legitimate self-write, and it happens
-- before any owner exists.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.cns_guard_employer_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  caller uuid;
  rec public.cns_employer_members;
  owner_count int;
begin
  -- TG_OP first: touching NEW during a DELETE raises "record is not assigned
  -- yet" in PL/pgSQL.
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;

  caller := auth.uid();
  if caller is null then return rec; end if;            -- service role
  if public.cns_is_staff() then return rec; end if;     -- platform staff

  -- The bootstrap case: creator claims ownership of an org that has none yet.
  if tg_op = 'INSERT' and rec.user_id = caller and rec.role = 'owner' then
    select count(*) into owner_count
      from public.cns_employer_members
     where employer_id = rec.employer_id and role = 'owner';
    if owner_count = 0 then
      return rec;
    end if;
  end if;

  if rec.user_id = caller then
    raise exception 'cannot modify your own membership' using errcode = '42501';
  end if;

  -- Never leave an organisation without an owner.
  if tg_op = 'DELETE' and rec.role = 'owner' then
    select count(*) into owner_count
      from public.cns_employer_members
     where employer_id = rec.employer_id and role = 'owner' and status = 'approved';
    if owner_count <= 1 then
      raise exception 'an organisation must keep at least one owner'
        using errcode = '42501';
    end if;
  end if;

  return rec;
end;
$fn$;

drop trigger if exists cns_guard_employer_member_trg on public.cns_employer_members;
create trigger cns_guard_employer_member_trg
  before insert or update or delete on public.cns_employer_members
  for each row execute function public.cns_guard_employer_member();


-- ────────────────────────────────────────────────────────────────────────────
-- 4. Postconditions.
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.cns_employer_members'::regclass
       and not tgisinternal
       and tgfoid = 'public.cns_guard_employer_member'::regproc
  ) then
    raise exception 'cns_employer_member_roles: guard trigger not attached';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'cns_employer_members'
       and policyname = 'cns employer members manage'
       and qual like '%cns_is_employer_owner%'
  ) then
    raise exception
      'cns_employer_member_roles: the manage policy is not owner-scoped - the hole is still open';
  end if;
end$$;

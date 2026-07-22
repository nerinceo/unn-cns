-- ---------------------------------------------------------------------------
-- Employer verification documents: restrict the storage key.
--
-- Found by testing production with a second, unrelated employer account: any
-- signed-in user could read cns_employers.registration_doc_key, and
-- getEmployerDocUrl() handed out a presigned URL based on exactly that read.
-- Every business registration document on the platform was reachable by any
-- logged-in nurse.
--
-- Two independent fixes, because either alone is one mistake away from the
-- leak coming back:
--   1. The key column is no longer selectable by anon/authenticated at all.
--   2. Entitlement is decided by a SECURITY DEFINER function, mirroring
--      cns_can_read_resume() — application code that forgets half the rule is
--      how this happened in the first place.
--
-- Additive and cns_-scoped. No HUB object is touched.
-- ---------------------------------------------------------------------------

-- --- 1. column-level privilege -------------------------------------------
--
-- Postgres has no "revoke one column from a table-level grant": the blanket
-- grant Supabase creates must be dropped first, then the readable columns
-- re-granted explicitly. Omitting a column here makes it unreadable, so the
-- list below is the full table minus registration_doc_key.
revoke select on public.cns_employers from anon, authenticated;

grant select (
  id, slug, name, employer_type, description, logo_url, website, email, phone,
  country, city, verification_status, status, review_note, created_by,
  created_at, updated_at, legal_name, contact_person, business_email,
  address, state
) on public.cns_employers to anon, authenticated;

-- service_role keeps its table-level grant, so the server action can still
-- read the key once the check below has said yes.

-- --- 2. entitlement ------------------------------------------------------
create or replace function public.cns_can_read_employer_doc(p_employer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cns_is_employer_member(p_employer_id)
      or public.cns_is_staff();
$$;

revoke all on function public.cns_can_read_employer_doc(uuid) from public;
grant execute on function public.cns_can_read_employer_doc(uuid) to authenticated;

-- --- verification --------------------------------------------------------
-- Expect: has_column_privilege false for the key, true for name.
select
  has_column_privilege('authenticated', 'public.cns_employers', 'registration_doc_key', 'SELECT')
    as authenticated_can_read_key,
  has_column_privilege('authenticated', 'public.cns_employers', 'name', 'SELECT')
    as authenticated_can_read_name,
  has_column_privilege('service_role', 'public.cns_employers', 'registration_doc_key', 'SELECT')
    as service_role_can_read_key;

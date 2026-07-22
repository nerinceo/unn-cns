-- ===========================================================================
-- CNS — Jobs portal.
--
-- Purely additive. Only cns_* objects. The single coupling to HUB is inbound
-- FKs to public.users(id).
--
-- EMPLOYERS ARE ORGANISATIONS, NOT USER ACCOUNTS.
-- public.users.role is a CHECK constraint, so adding an 'employer' value would
-- mean altering a HUB table (forbidden) AND would make hospitals appear as
-- people in HUB's feed, network and messaging. Instead an employer is an org
-- with members, exactly how public.units already models a unit: a recruiter
-- signs in as an ordinary UNN member and their employer capability is CNS data.
-- Zero change to public.users.
--
-- ANONYMOUS READ IS DELIBERATE AND LOAD-BEARING.
-- Published jobs from approved employers are readable by `anon`, because job
-- pages must be crawlable for schema.org/JobPosting markup to reach Google for
-- Jobs — free distribution, and the only realistic acquisition channel for a
-- new board. Everything else (drafts, applications, employer members) stays
-- private. Applying still requires a session.
--
-- Run manually in Supabase Dashboard > SQL Editor. Safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Employers
-- ---------------------------------------------------------------------------
create table if not exists public.cns_employers (
  id uuid default uuid_generate_v4() primary key,
  slug text unique not null,
  name text not null,
  employer_type text not null default 'hospital'
    check (employer_type in ('hospital','clinic','agency','university','other')),
  description text,
  logo_url text,
  website text,
  email text,
  phone text,
  country text,
  city text,

  -- Verification of the ORGANISATION — separate from nurse verification, and
  -- different evidence entirely (business registration, not a licence).
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified','rejected')),
  registration_doc_key text,          -- private R2 key; never exposed to clients

  -- Approval gate. Mirrors public.units: nothing is publishable until staff
  -- approve, so the board cannot be spammed.
  status text not null default 'pending'
    check (status in ('pending','approved','suspended','rejected')),
  review_note text,

  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Who may act for an employer. The user is an ordinary UNN member.
create table if not exists public.cns_employer_members (
  id uuid default uuid_generate_v4() primary key,
  employer_id uuid references public.cns_employers(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  role text not null default 'recruiter' check (role in ('owner','recruiter')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique (employer_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 2. Jobs
--
-- Field set is shaped by schema.org/JobPosting so the JSON-LD can be generated
-- from the row with no hand-maintained duplicate. Google issues a manual action
-- when markup disagrees with the visible page, so both must render from here.
-- ---------------------------------------------------------------------------
create table if not exists public.cns_jobs (
  id uuid default uuid_generate_v4() primary key,
  employer_id uuid references public.cns_employers(id) on delete cascade not null,
  slug text unique not null,

  title text not null,                       -- schema: title. Job title ONLY.
  description text not null,                 -- schema: description. HTML.
  responsibilities text,
  qualifications text,

  -- schema: employmentType. Stored in our vocabulary; mapped to Google's
  -- (FULL_TIME/PART_TIME/CONTRACTOR/TEMPORARY/INTERN/VOLUNTEER/PER_DIEM/OTHER)
  -- in lib/cns/jobs.ts. Kept separate so product wording can change without
  -- breaking markup.
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time','part_time','contract','locum','internship','volunteer')),

  work_mode text not null default 'onsite' check (work_mode in ('onsite','hybrid','remote')),
  country text,
  state text,
  city text,
  street_address text,
  postal_code text,

  specialty text,                            -- ICU, Paediatrics, Theatre...
  experience_min_years int,
  qualification_required text,
  license_required boolean not null default false,

  -- schema: baseSalary (MonetaryAmount). unitText must be one of
  -- HOUR/DAY/WEEK/MONTH/YEAR.
  salary_min numeric(12,2),
  salary_max numeric(12,2),
  salary_currency text default 'INR',
  salary_period text default 'MONTH'
    check (salary_period in ('HOUR','DAY','WEEK','MONTH','YEAR')),
  salary_undisclosed boolean not null default false,

  vacancies int not null default 1,

  -- schema: validThrough. NOT optional in practice — Google treats a missing
  -- expiry as a quality signal against the listing, and a board full of stale
  -- undated jobs can have EVERY listing manually removed. The daily cron below
  -- closes anything past this date.
  application_deadline date,

  apply_mode text not null default 'in_app' check (apply_mode in ('in_app','external')),
  external_apply_url text,

  status text not null default 'draft'
    check (status in ('draft','pending_review','published','closed','archived')),
  published_at timestamptz,
  views_count int not null default 0,

  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- An external-apply job without a URL is unusable; refuse it at the database.
  constraint cns_jobs_external_url check (
    apply_mode <> 'external' or external_apply_url is not null
  )
);

-- ---------------------------------------------------------------------------
-- 3. Applications
--
-- profile_snapshot freezes what was submitted. Without it, a later profile edit
-- retroactively rewrites what the employer reviewed and there is no record of
-- the actual application.
--
-- The snapshot deliberately EXCLUDES email, phone, date of birth and address.
-- Contact details are released only when the employer moves the application to
-- 'shortlisted'. Keeping CNS out of the PII business was a deliberate choice;
-- the snapshot must not quietly undo it. See lib/cns/jobs.ts buildSnapshot().
-- ---------------------------------------------------------------------------
create table if not exists public.cns_job_applications (
  id uuid default uuid_generate_v4() primary key,
  job_id uuid references public.cns_jobs(id) on delete cascade not null,
  applicant_id uuid references public.users(id) on delete cascade not null,
  resume_id uuid references public.cns_resumes(id) on delete set null,

  cover_note text,
  profile_snapshot jsonb not null default '{}'::jsonb,

  status text not null default 'submitted'
    check (status in ('submitted','viewed','shortlisted','interview','offered','rejected','withdrawn')),
  status_changed_at timestamptz not null default now(),
  employer_note text,                        -- private to the employer

  created_at timestamptz not null default now(),
  unique (job_id, applicant_id)              -- one application per job
);

create table if not exists public.cns_job_saves (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  job_id uuid references public.cns_jobs(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique (user_id, job_id)
);

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------
create index if not exists cns_jobs_browse_idx
  on public.cns_jobs(status, published_at desc) where status = 'published';
create index if not exists cns_jobs_employer_idx on public.cns_jobs(employer_id, status);
create index if not exists cns_jobs_filter_idx
  on public.cns_jobs(country, city, employment_type, work_mode) where status = 'published';
create index if not exists cns_jobs_specialty_idx on public.cns_jobs(specialty) where status = 'published';
create index if not exists cns_jobs_deadline_idx
  on public.cns_jobs(application_deadline) where status = 'published';
create index if not exists cns_jobs_fts_idx
  on public.cns_jobs using gin(to_tsvector('english',
    coalesce(title,'') || ' ' || coalesce(specialty,'') || ' ' || coalesce(description,'')));
create index if not exists cns_applications_job_idx on public.cns_job_applications(job_id, status);
create index if not exists cns_applications_user_idx on public.cns_job_applications(applicant_id, created_at desc);
create index if not exists cns_employer_members_user_idx on public.cns_employer_members(user_id, status);

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.cns_employers          enable row level security;
alter table public.cns_employer_members   enable row level security;
alter table public.cns_jobs               enable row level security;
alter table public.cns_job_applications   enable row level security;
alter table public.cns_job_saves          enable row level security;

-- Helper: is the caller an approved member of this employer?
create or replace function public.cns_is_employer_member(p_employer uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.cns_employer_members m
     where m.employer_id = p_employer
       and m.user_id = auth.uid()
       and m.status = 'approved'
  );
$$;
grant execute on function public.cns_is_employer_member(uuid) to authenticated;

-- Helper: platform staff?
create or replace function public.cns_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.users u
     where u.id = auth.uid()
       and u.role in ('platform_admin','platform_moderator')
  );
$$;
grant execute on function public.cns_is_staff() to authenticated;

-- --- employers -------------------------------------------------------------
-- ANON read of approved employers: required to render hiringOrganization on a
-- crawlable job page. Only public-facing columns matter here; the private doc
-- key is never selected by the app.
drop policy if exists "cns employers public read" on public.cns_employers;
create policy "cns employers public read"
  on public.cns_employers for select to anon, authenticated
  using (status = 'approved');

drop policy if exists "cns employers member read" on public.cns_employers;
create policy "cns employers member read"
  on public.cns_employers for select to authenticated
  using (created_by = auth.uid() or public.cns_is_employer_member(id) or public.cns_is_staff());

-- Anyone signed in may register an employer; it lands 'pending'.
drop policy if exists "cns employers create" on public.cns_employers;
create policy "cns employers create"
  on public.cns_employers for insert to authenticated
  with check (created_by = auth.uid() and status = 'pending');

drop policy if exists "cns employers update" on public.cns_employers;
create policy "cns employers update"
  on public.cns_employers for update to authenticated
  using (public.cns_is_employer_member(id) or public.cns_is_staff());

-- --- employer members ------------------------------------------------------
drop policy if exists "cns employer members read" on public.cns_employer_members;
create policy "cns employer members read"
  on public.cns_employer_members for select to authenticated
  using (user_id = auth.uid() or public.cns_is_employer_member(employer_id) or public.cns_is_staff());

-- BOOTSTRAP. Without this the first member of an employer can never be
-- inserted: "manage" below requires the caller to ALREADY be an approved
-- member, which is impossible for the founding row. The person who registered
-- the organisation may add THEMSELVES (and only themselves) to it.
--
-- Safe because it does not grant publishing rights — cns_employers.status stays
-- 'pending' until staff approve, and publishJob() checks that separately.
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

drop policy if exists "cns employer members manage" on public.cns_employer_members;
create policy "cns employer members manage"
  on public.cns_employer_members for all to authenticated
  using (public.cns_is_employer_member(employer_id) or public.cns_is_staff())
  with check (public.cns_is_employer_member(employer_id) or public.cns_is_staff());

-- --- jobs ------------------------------------------------------------------
-- THE crawlable policy. Published + employer approved => visible to anon.
drop policy if exists "cns jobs public read" on public.cns_jobs;
create policy "cns jobs public read"
  on public.cns_jobs for select to anon, authenticated
  using (
    status = 'published'
    and exists (select 1 from public.cns_employers e
                 where e.id = employer_id and e.status = 'approved')
  );

drop policy if exists "cns jobs employer read" on public.cns_jobs;
create policy "cns jobs employer read"
  on public.cns_jobs for select to authenticated
  using (public.cns_is_employer_member(employer_id) or public.cns_is_staff());

drop policy if exists "cns jobs employer write" on public.cns_jobs;
create policy "cns jobs employer write"
  on public.cns_jobs for all to authenticated
  using (public.cns_is_employer_member(employer_id) or public.cns_is_staff())
  with check (public.cns_is_employer_member(employer_id) or public.cns_is_staff());

-- --- applications ----------------------------------------------------------
drop policy if exists "cns applications own read" on public.cns_job_applications;
create policy "cns applications own read"
  on public.cns_job_applications for select to authenticated
  using (applicant_id = auth.uid());

drop policy if exists "cns applications employer read" on public.cns_job_applications;
create policy "cns applications employer read"
  on public.cns_job_applications for select to authenticated
  using (exists (select 1 from public.cns_jobs j
                  where j.id = job_id and public.cns_is_employer_member(j.employer_id)));

-- Apply only to a published job, only as yourself.
drop policy if exists "cns applications create" on public.cns_job_applications;
create policy "cns applications create"
  on public.cns_job_applications for insert to authenticated
  with check (
    applicant_id = auth.uid()
    and exists (select 1 from public.cns_jobs j
                 where j.id = job_id and j.status = 'published')
  );

-- Applicant may withdraw. Employers move status via cns_set_application_status()
-- so the snapshot can never be rewritten by the side reviewing it.
drop policy if exists "cns applications withdraw" on public.cns_job_applications;
create policy "cns applications withdraw"
  on public.cns_job_applications for update to authenticated
  using (applicant_id = auth.uid());

drop policy if exists "cns job saves own" on public.cns_job_saves;
create policy "cns job saves own"
  on public.cns_job_saves for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Employer-side status change.
--
-- Definer so an employer can update status/note WITHOUT holding a general
-- UPDATE grant on the table, which would also let them edit profile_snapshot —
-- i.e. alter the evidence of what a candidate actually submitted.
-- ---------------------------------------------------------------------------
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
  if p_status not in ('viewed','shortlisted','interview','offered','rejected') then
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
end;
$$;
revoke all on function public.cns_set_application_status(uuid, text, text) from public, anon;
grant execute on function public.cns_set_application_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Expiry.
--
-- Called by a daily cron. Google penalises stale undated listings, and a board
-- with many of them risks having every job delisted — so this is not optional
-- housekeeping, it protects the acquisition channel.
-- ---------------------------------------------------------------------------
create or replace function public.cns_close_expired_jobs()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  update public.cns_jobs
     set status = 'closed', updated_at = now()
   where status = 'published'
     and application_deadline is not null
     and application_deadline < current_date;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.cns_close_expired_jobs() from public, anon, authenticated;

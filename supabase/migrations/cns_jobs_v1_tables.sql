-- ===========================================================================
-- CNS Jobs — Basic Version supporting tables.
--
-- RUN ORDER: cns_job_taxonomy.sql -> THIS FILE -> cns_jobs_v1_alignment.sql
-- The alignment migration writes to cns_application_status_history, so this
-- has to exist first.
--
-- Purely additive. Every object is cns_*. Safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Job-seeker profile (blueprint §6.1)
--
-- Separate from public.profiles because CNS may never write HUB tables. It
-- holds what HUB does not: preferences, licensure and job-search context.
--
-- LICENSURE IS SELF-DECLARED FREE TEXT. §15 is explicit that the Basic Version
-- must not claim UNN verifies professional licences, so there is deliberately
-- no verified flag and no document here.
-- ---------------------------------------------------------------------------
create table if not exists public.cns_job_seeker_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,

  nursing_role text,                       -- taxonomy value
  is_student boolean not null default false,
  experience_level text,                   -- taxonomy value
  total_years numeric(4,1),
  specialties text[] default '{}',         -- taxonomy values

  licence_country text,
  licence_type text,
  licence_number text,
  licence_status text,                     -- self-declared; NOT verified by UNN

  highest_qualification text,
  institution text,
  graduation_year int,

  -- Preferences drive the daily job alert and the recommended list.
  preferred_countries text[] default '{}',
  preferred_roles text[] default '{}',
  preferred_employment_types text[] default '{}',
  preferred_work_settings text[] default '{}',

  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Uploaded resumes (blueprint §6.1)
--
-- Complements the structured builder in cns_resumes rather than replacing it:
-- 94 of 96 measured profiles had no experience data, so upload-only would have
-- blocked most nurses from applying, and builder-only would have stopped anyone
-- with an existing CV from using it.
--
-- The file itself lives in a PRIVATE R2 bucket. storage_key never reaches a
-- client; access is a short-lived presigned URL issued after the check in
-- cns_can_read_resume() below.
-- ---------------------------------------------------------------------------
create table if not exists public.cns_resume_files (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade not null,
  storage_key text not null,               -- private R2 object key. NEVER exposed.
  file_name text not null,
  mime_type text not null,
  size_bytes int not null,
  is_active boolean not null default true, -- one active upload per member
  created_at timestamptz not null default now()
);

create unique index if not exists cns_resume_files_one_active_idx
  on public.cns_resume_files(user_id) where is_active;

-- ---------------------------------------------------------------------------
-- 3. Employer verification history (blueprint §9.1 "maintain verification history")
-- ---------------------------------------------------------------------------
create table if not exists public.cns_employer_verifications (
  id uuid primary key default uuid_generate_v4(),
  employer_id uuid references public.cns_employers(id) on delete cascade not null,
  status text not null check (status in
    ('submitted','under_review','approved','changes_requested','rejected','suspended')),
  reviewer_id uuid references public.users(id) on delete set null,
  note text,
  document_keys text[] default '{}',       -- private R2 keys
  created_at timestamptz not null default now()
);

create index if not exists cns_employer_verifications_idx
  on public.cns_employer_verifications(employer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Screening questions (blueprint §7.3 — max five, short answer or yes/no)
-- ---------------------------------------------------------------------------
create table if not exists public.cns_job_screening_questions (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references public.cns_jobs(id) on delete cascade not null,
  question text not null,
  question_type text not null default 'short_answer'
    check (question_type in ('short_answer','yes_no')),
  is_required boolean not null default false,
  position int not null default 0,
  unique (job_id, position)
);

-- The five-question cap is enforced in the database, not just the form: a
-- client-side limit is a suggestion, and this is cheap to guarantee.
create or replace function public.cns_check_screening_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.cns_job_screening_questions where job_id = new.job_id) >= 5 then
    raise exception 'a job may have at most 5 screening questions' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists cns_screening_limit on public.cns_job_screening_questions;
create trigger cns_screening_limit
  before insert on public.cns_job_screening_questions
  for each row execute function public.cns_check_screening_limit();

-- Answers are snapshotted alongside the application: the question TEXT is
-- copied in, so an employer editing a question later cannot change what the
-- candidate appears to have been asked.
create table if not exists public.cns_application_answers (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid references public.cns_job_applications(id) on delete cascade not null,
  question_id uuid references public.cns_job_screening_questions(id) on delete set null,
  question_text text not null,
  answer text,
  created_at timestamptz not null default now()
);

create index if not exists cns_application_answers_idx
  on public.cns_application_answers(application_id);

-- ---------------------------------------------------------------------------
-- 5. Application status history (blueprint §6.3 — status, timestamp AND actor)
-- ---------------------------------------------------------------------------
create table if not exists public.cns_application_status_history (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid references public.cns_job_applications(id) on delete cascade not null,
  status text not null,
  actor_id uuid references public.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists cns_application_status_history_idx
  on public.cns_application_status_history(application_id, created_at);

-- ---------------------------------------------------------------------------
-- 6. Reports (blueprint §9.3)
-- ---------------------------------------------------------------------------
create table if not exists public.cns_job_reports (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid references public.cns_jobs(id) on delete cascade,
  employer_id uuid references public.cns_employers(id) on delete cascade,
  reporter_id uuid references public.users(id) on delete set null,
  reason text not null check (reason in
    ('suspicious_job','inaccurate_information','discrimination','payment_request',
     'expired_job','duplicate_job','other')),
  detail text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  resolution_note text,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  -- A report must point at something.
  constraint cns_job_reports_target check (job_id is not null or employer_id is not null)
);

create index if not exists cns_job_reports_open_idx
  on public.cns_job_reports(status, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. Audit log (blueprint §9.2, §13)
--
-- Append-only by design: there is no update or delete policy anywhere below,
-- so even staff cannot rewrite it through the API.
-- ---------------------------------------------------------------------------
create table if not exists public.cns_audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references public.users(id) on delete set null,
  action text not null,                    -- 'employer.approve', 'job.reject', ...
  target_type text not null,               -- 'employer' | 'job' | 'application' | 'report'
  target_id uuid,
  reason text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index if not exists cns_audit_logs_idx
  on public.cns_audit_logs(target_type, target_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 8. Job alerts (blueprint §6.4 — daily, not instant, to keep it simple)
-- ---------------------------------------------------------------------------
create table if not exists public.cns_job_alerts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade not null,
  countries text[] default '{}',
  roles text[] default '{}',
  channel text not null default 'in_app' check (channel in ('in_app','email')),
  is_active boolean not null default true,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id)
);

-- ---------------------------------------------------------------------------
-- 9. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.cns_job_seeker_profiles       enable row level security;
alter table public.cns_resume_files              enable row level security;
alter table public.cns_employer_verifications    enable row level security;
alter table public.cns_job_screening_questions   enable row level security;
alter table public.cns_application_answers       enable row level security;
alter table public.cns_application_status_history enable row level security;
alter table public.cns_job_reports               enable row level security;
alter table public.cns_audit_logs                enable row level security;
alter table public.cns_job_alerts                enable row level security;

-- --- own-row -------------------------------------------------------------
drop policy if exists "cns seeker profile own" on public.cns_job_seeker_profiles;
create policy "cns seeker profile own"
  on public.cns_job_seeker_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "cns resume files own" on public.cns_resume_files;
create policy "cns resume files own"
  on public.cns_resume_files for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "cns job alerts own" on public.cns_job_alerts;
create policy "cns job alerts own"
  on public.cns_job_alerts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --- screening questions --------------------------------------------------
-- Public read so the apply form can render them before submission.
drop policy if exists "cns screening public read" on public.cns_job_screening_questions;
create policy "cns screening public read"
  on public.cns_job_screening_questions for select to anon, authenticated
  using (exists (select 1 from public.cns_jobs j
                  where j.id = job_id and j.status = 'active'));

drop policy if exists "cns screening employer manage" on public.cns_job_screening_questions;
create policy "cns screening employer manage"
  on public.cns_job_screening_questions for all to authenticated
  using (exists (select 1 from public.cns_jobs j
                  where j.id = job_id
                    and (public.cns_is_employer_member(j.employer_id) or public.cns_is_staff())))
  with check (exists (select 1 from public.cns_jobs j
                       where j.id = job_id
                         and (public.cns_is_employer_member(j.employer_id) or public.cns_is_staff())));

-- --- answers: applicant and the receiving employer -------------------------
drop policy if exists "cns answers read" on public.cns_application_answers;
create policy "cns answers read"
  on public.cns_application_answers for select to authenticated
  using (exists (
    select 1 from public.cns_job_applications a
      join public.cns_jobs j on j.id = a.job_id
     where a.id = application_id
       and (a.applicant_id = auth.uid() or public.cns_is_employer_member(j.employer_id))
  ));

drop policy if exists "cns answers write" on public.cns_application_answers;
create policy "cns answers write"
  on public.cns_application_answers for insert to authenticated
  with check (exists (select 1 from public.cns_job_applications a
                       where a.id = application_id and a.applicant_id = auth.uid()));

-- --- status history: read only, written by the definer function ------------
drop policy if exists "cns status history read" on public.cns_application_status_history;
create policy "cns status history read"
  on public.cns_application_status_history for select to authenticated
  using (exists (
    select 1 from public.cns_job_applications a
      join public.cns_jobs j on j.id = a.job_id
     where a.id = application_id
       and (a.applicant_id = auth.uid() or public.cns_is_employer_member(j.employer_id)
            or public.cns_is_staff())
  ));

-- --- verifications ---------------------------------------------------------
drop policy if exists "cns verifications read" on public.cns_employer_verifications;
create policy "cns verifications read"
  on public.cns_employer_verifications for select to authenticated
  using (public.cns_is_employer_member(employer_id) or public.cns_is_staff());

drop policy if exists "cns verifications write" on public.cns_employer_verifications;
create policy "cns verifications write"
  on public.cns_employer_verifications for insert to authenticated
  with check (public.cns_is_employer_member(employer_id) or public.cns_is_staff());

-- --- reports ---------------------------------------------------------------
drop policy if exists "cns reports create" on public.cns_job_reports;
create policy "cns reports create"
  on public.cns_job_reports for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "cns reports read" on public.cns_job_reports;
create policy "cns reports read"
  on public.cns_job_reports for select to authenticated
  using (reporter_id = auth.uid() or public.cns_is_staff());

drop policy if exists "cns reports resolve" on public.cns_job_reports;
create policy "cns reports resolve"
  on public.cns_job_reports for update to authenticated
  using (public.cns_is_staff()) with check (public.cns_is_staff());

-- --- audit log: staff may READ, nobody may write through the API -----------
drop policy if exists "cns audit read" on public.cns_audit_logs;
create policy "cns audit read"
  on public.cns_audit_logs for select to authenticated
  using (public.cns_is_staff());
-- Intentionally NO insert/update/delete policy. Rows are written by
-- cns_write_audit() below, which is SECURITY DEFINER, so the log cannot be
-- edited or erased by anyone holding a normal session — including staff.

create or replace function public.cns_write_audit(
  p_action text, p_target_type text, p_target_id uuid,
  p_reason text default null, p_metadata jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.cns_audit_logs (actor_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_reason, coalesce(p_metadata, '{}'));
end;
$$;
revoke all on function public.cns_write_audit(text, text, uuid, text, jsonb) from public, anon;
grant execute on function public.cns_write_audit(text, text, uuid, text, jsonb) to authenticated;

-- Applications may now cite an uploaded file as well as a built resume.
alter table public.cns_job_applications
  add column if not exists resume_file_id uuid references public.cns_resume_files(id) on delete set null,
  add column if not exists declaration_accepted_at timestamptz;

-- ---------------------------------------------------------------------------
-- 10. Resume access control
--
-- The rule the blueprint implies but does not spell out: an employer may read
-- an applicant's resume ONLY for a job that person actually applied to. That
-- has to be a database check — application code that forgets it leaks every
-- CV on the platform.
--
-- !! SUPERSEDED IN PRODUCTION by unn-uhn/supabase/migrations/0001_uhn_registry.sql
-- !! section 5, which adds a THIRD clause: a member who ticked both registry
-- !! toggles shares their active CV with approved recruiters without applying.
-- !!
-- !! RE-RUNNING THIS FILE REVERTS THAT WIDENING. Both clauses below are
-- !! reproduced verbatim in UHN 0001, so the fix is to re-run UHN 0001 after
-- !! this one. The symptom otherwise is a registry CV button that refuses with
-- !! "you do not have access to this file" and nothing in the logs to say why.
-- ---------------------------------------------------------------------------
create or replace function public.cns_can_read_resume(p_resume_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.cns_resume_files r
     where r.id = p_resume_id
       and (
         r.user_id = auth.uid()                       -- the owner
         or exists (                                   -- or an employer they applied to
           select 1
             from public.cns_job_applications a
             join public.cns_jobs j on j.id = a.job_id
            where a.resume_file_id = r.id
              and public.cns_is_employer_member(j.employer_id)
         )
       )
  );
$$;
grant execute on function public.cns_can_read_resume(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
select 'cns_job_seeker_profiles' as t, count(*)::text from public.cns_job_seeker_profiles
union all select 'cns_resume_files',              count(*)::text from public.cns_resume_files
union all select 'cns_employer_verifications',    count(*)::text from public.cns_employer_verifications
union all select 'cns_job_screening_questions',   count(*)::text from public.cns_job_screening_questions
union all select 'cns_application_answers',       count(*)::text from public.cns_application_answers
union all select 'cns_application_status_history',count(*)::text from public.cns_application_status_history
union all select 'cns_job_reports',               count(*)::text from public.cns_job_reports
union all select 'cns_audit_logs',                count(*)::text from public.cns_audit_logs
union all select 'cns_job_alerts',                count(*)::text from public.cns_job_alerts;

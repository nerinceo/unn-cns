-- ===========================================================================
-- CNS Jobs — controlled vocabularies for the six primary filters.
--
-- One table for all six kinds rather than six tables, so the admin screen that
-- maintains them is one screen, and adding a seventh dimension later is a row
-- in a CHECK rather than a new table plus new policies plus new UI.
--
-- WHY A TABLE AND NOT CHECK CONSTRAINTS
-- These lists grow. A new specialty, a new country, a renamed role — with
-- enums each of those is a migration and a deploy. Here it is an admin edit.
-- The blueprint anticipates exactly this ("job_categories: admin-managed roles,
-- specialties, settings and employment types, if not represented through
-- controlled enums").
--
-- Jobs store `value` (a stable slug), never `label`. So renaming
-- "Medical-Surgical" to "Medical / Surgical" is a display change and orphans
-- nothing.
--
-- Deactivating rather than deleting is the supported way to retire a value:
-- is_active = false removes it from the filter UI while existing jobs that
-- reference it keep rendering.
--
-- Read by `anon` because filters render on the public, crawlable job board.
-- Written by platform staff only.
--
-- Run manually in Supabase Dashboard > SQL Editor. Safe to re-run — the seed
-- upserts on (kind, value) and preserves any label or ordering an admin has
-- since edited.
-- ===========================================================================

create table if not exists public.cns_job_categories (
  id uuid primary key default uuid_generate_v4(),
  kind text not null check (kind in (
    'country','nursing_role','specialty','employment_type','work_setting','experience_level'
  )),
  value text not null,                 -- stable slug; this is what jobs store
  label text not null,                 -- display text; editable
  -- ISO 3166-1 alpha-2 for kind='country'. Kept here so the JobPosting markup
  -- can emit a code without a second lookup table.
  code text,
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kind, value)
);

create index if not exists cns_job_categories_kind_idx
  on public.cns_job_categories(kind, position) where is_active;

alter table public.cns_job_categories enable row level security;

drop policy if exists "cns categories public read" on public.cns_job_categories;
create policy "cns categories public read"
  on public.cns_job_categories for select to anon, authenticated
  using (true);

drop policy if exists "cns categories staff write" on public.cns_job_categories;
create policy "cns categories staff write"
  on public.cns_job_categories for all to authenticated
  using (public.cns_is_staff()) with check (public.cns_is_staff());

-- ---------------------------------------------------------------------------
-- Seed — verbatim from the blueprint §5.
--
-- ON CONFLICT DO UPDATE only touches `position`, deliberately: re-running keeps
-- any label an admin has reworded and any value they have deactivated, while
-- still repairing ordering.
-- ---------------------------------------------------------------------------
insert into public.cns_job_categories (kind, value, label, code, position) values
  -- §5.1 Country -------------------------------------------------------------
  ('country','india','India','IN',1),
  ('country','canada','Canada','CA',2),
  ('country','united-states','United States','US',3),
  ('country','australia','Australia','AU',4),
  ('country','new-zealand','New Zealand','NZ',5),
  ('country','united-kingdom','United Kingdom','GB',6),
  ('country','ireland','Ireland','IE',7),
  ('country','united-arab-emirates','United Arab Emirates','AE',8),
  ('country','saudi-arabia','Saudi Arabia','SA',9),
  ('country','oman','Oman','OM',10),
  ('country','qatar','Qatar','QA',11),
  ('country','kuwait','Kuwait','KW',12),
  ('country','bahrain','Bahrain','BH',13),
  ('country','germany','Germany','DE',14),
  ('country','singapore','Singapore','SG',15),
  ('country','switzerland','Switzerland','CH',16),
  ('country','other','Other Countries',null,99),

  -- §5.2 Nursing Role --------------------------------------------------------
  ('nursing_role','registered-nurse','Registered Nurse',null,1),
  ('nursing_role','staff-nurse','Staff Nurse',null,2),
  ('nursing_role','practical-nurse','Practical Nurse',null,3),
  ('nursing_role','enrolled-nurse','Enrolled Nurse',null,4),
  ('nursing_role','nursing-assistant','Nursing Assistant',null,5),
  ('nursing_role','healthcare-assistant','Healthcare Assistant',null,6),
  ('nursing_role','nurse-practitioner','Nurse Practitioner',null,7),
  ('nursing_role','charge-nurse','Charge Nurse',null,8),
  ('nursing_role','nurse-manager','Nurse Manager',null,9),
  ('nursing_role','nurse-educator','Nurse Educator',null,10),
  ('nursing_role','clinical-instructor','Clinical Instructor',null,11),
  ('nursing_role','home-care-nurse','Home Care Nurse',null,12),
  ('nursing_role','community-health-nurse','Community Health Nurse',null,13),
  ('nursing_role','travel-nurse','Travel Nurse',null,14),
  ('nursing_role','graduate-nurse','Graduate Nurse',null,15),
  ('nursing_role','other','Other',null,99),

  -- §5.3 Specialty -----------------------------------------------------------
  ('specialty','medical-surgical','Medical-Surgical',null,1),
  ('specialty','icu-critical-care','ICU / Critical Care',null,2),
  ('specialty','emergency','Emergency',null,3),
  ('specialty','operating-room','Operating Room',null,4),
  ('specialty','pediatrics','Pediatrics',null,5),
  ('specialty','nicu','NICU',null,6),
  ('specialty','maternity','Maternity',null,7),
  ('specialty','mental-health','Mental Health',null,8),
  ('specialty','community-health','Community Health',null,9),
  ('specialty','home-care','Home Care',null,10),
  ('specialty','long-term-care','Long-Term Care',null,11),
  ('specialty','oncology','Oncology',null,12),
  ('specialty','dialysis','Dialysis',null,13),
  ('specialty','cardiology','Cardiology',null,14),
  ('specialty','rehabilitation','Rehabilitation',null,15),
  ('specialty','nursing-education','Nursing Education',null,16),
  ('specialty','nursing-management','Nursing Management',null,17),
  ('specialty','other','Other',null,99),

  -- §5.4 Employment Type -----------------------------------------------------
  -- `code` carries the schema.org employmentType value, so the JobPosting
  -- markup that feeds Google for Jobs is driven by this table rather than a
  -- hardcoded map that can drift from it.
  ('employment_type','full-time','Full-time','FULL_TIME',1),
  ('employment_type','part-time','Part-time','PART_TIME',2),
  ('employment_type','casual','Casual','PER_DIEM',3),
  ('employment_type','temporary','Temporary','TEMPORARY',4),
  ('employment_type','contract','Contract','CONTRACTOR',5),
  ('employment_type','permanent','Permanent','FULL_TIME',6),
  ('employment_type','internship','Internship','INTERN',7),
  ('employment_type','travel-assignment','Travel Assignment','TEMPORARY',8),

  -- §5.5 Work Setting --------------------------------------------------------
  -- NOTE: distinct from work_mode/is_remote. Setting is WHERE the care happens
  -- (a hospital, a home, a school); remote is HOW the nurse attends.
  ('work_setting','hospital','Hospital',null,1),
  ('work_setting','clinic','Clinic',null,2),
  ('work_setting','long-term-care','Long-Term Care',null,3),
  ('work_setting','nursing-home','Nursing Home',null,4),
  ('work_setting','home-care','Home Care',null,5),
  ('work_setting','community-health','Community Health',null,6),
  ('work_setting','rehabilitation-centre','Rehabilitation Centre',null,7),
  ('work_setting','mental-health-facility','Mental Health Facility',null,8),
  ('work_setting','school','School',null,9),
  ('work_setting','university-college','University / College',null,10),
  ('work_setting','government','Government',null,11),
  ('work_setting','private-practice','Private Practice',null,12),
  ('work_setting','telehealth','Telehealth',null,13),
  ('work_setting','hospice-palliative','Hospice / Palliative Care',null,14),
  ('work_setting','other','Other',null,99),

  -- §5.6 Experience Level ----------------------------------------------------
  -- `code` is the lower bound in years, so "5+ Years" can match a job asking
  -- for 3 without string parsing at query time.
  ('experience_level','none','No Experience','0',1),
  ('experience_level','under-1','Less than 1 Year','0',2),
  ('experience_level','1-3','1-3 Years','1',3),
  ('experience_level','3-5','3-5 Years','3',4),
  ('experience_level','5-plus','5+ Years','5',5)
on conflict (kind, value) do update
  set position = excluded.position;

-- ---------------------------------------------------------------------------
-- Verification. Expect: country 17, nursing_role 16, specialty 18,
-- employment_type 8, work_setting 15, experience_level 5.
-- ---------------------------------------------------------------------------
select kind, count(*) as values
  from public.cns_job_categories
 group by kind
 order by kind;

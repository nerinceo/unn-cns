-- ---------------------------------------------------------------------------
-- Hospital hiring platforms (2026-10-11). Re-runnable.
--
-- Adds the 'ats' source kind: vacancies read from the public API behind a
-- hospital chain's careers site — PeopleStrong (Apollo, CARE, Jupiter),
-- Zwayam (Manipal, Hinduja, Motherhood), TurboHire (Kauvery), Recruiterbox
-- (Fortis). config.platform says which; a new platform is new adapter code in
-- UHN lib/jobs-import/ats.ts, never another migration.
--
-- Fetched by UHN's 6-hourly import (/api/cron/import-jobs) like every other
-- feed. Only widens two CHECK constraints. Nothing existing changes.
-- ---------------------------------------------------------------------------

alter table public.cns_job_sources drop constraint if exists cns_job_sources_kind_check;
alter table public.cns_job_sources add constraint cns_job_sources_kind_check
  check (kind in ('adzuna', 'jooble', 'greenhouse', 'lever', 'manual', 'crawl', 'ats'));

alter table public.cns_jobs drop constraint if exists cns_jobs_source_check;
alter table public.cns_jobs add constraint cns_jobs_source_check
  check (source in ('native', 'adzuna', 'jooble', 'greenhouse', 'lever', 'manual', 'crawl', 'ats'));

-- --- verification --------------------------------------------------------
-- Expect both constraints to list 'ats'.
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conname in ('cns_job_sources_kind_check', 'cns_jobs_source_check');

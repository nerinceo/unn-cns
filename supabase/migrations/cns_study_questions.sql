-- !! SUPERSEDED READ POLICIES (2026-10-11): the "cns study read" /
-- !! "cns questions readable" / "cns options readable" policies below were
-- !! OPEN to every signed-in member. HUB migrations 0081 + 0082
-- !! (unn-platform/supabase/migrations) replaced them with paid-access rules.
-- !! Re-running this file REOPENS the paywall — re-run 0082 afterwards.

-- ---------------------------------------------------------------------------
-- Revision bank: model-answer study questions.
--
-- The RGUHS source holds ~7,690 open-ended questions — Short Essay, Clinical
-- Viva, Case Scenario, Nursing Care Plan and so on. These are NOT objective
-- questions: there is no correct option and a five-mark essay cannot be
-- auto-graded by exact match. Forcing them into cns_questions would make the
-- grader mark every attempt wrong.
--
-- So they live here instead, as a distinct kind of content: read the question,
-- reveal the model answer, self-assess. Same institution/subject/topic
-- hierarchy as cns_questions, so a subject shows both its practice MCQs and its
-- revision questions.
--
-- Unlike cns_questions there are NO secret columns — the model answer is the
-- point, and every published row is fully readable. That is the whole
-- difference in the security model.
--
-- cns_-scoped and additive. No HUB object is touched.
-- ---------------------------------------------------------------------------

create table if not exists public.cns_study_questions (
  id uuid default uuid_generate_v4() primary key,
  institution_id uuid references public.cns_institutions(id) on delete set null,
  subject_id uuid references public.cns_subjects(id) on delete cascade not null,
  topic_id uuid references public.cns_topics(id) on delete set null,
  -- The original source label, kept verbatim ('Short Essay', 'Clinical Viva',
  -- 'Case Scenario'...). Deliberately free text, not a CHECK: the source has 28
  -- of these and they are descriptive, not a controlled vocabulary we grade on.
  source_question_type text,
  stem text not null,
  model_answer text,
  rationale text,
  exam_tip text,
  marks numeric(5,2),
  category text,                                   -- 'Theory' / 'Practical' / ...
  tags text[] default '{}',
  status text not null default 'draft'
    check (status in ('draft','review','published','archived')),
  source_ref text,
  source_exam_year int,
  import_batch_id uuid,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Idempotent re-import: the source row id is stable per institution.
create unique index if not exists cns_study_questions_source_ref_idx
  on public.cns_study_questions(institution_id, source_ref) where source_ref is not null;
create index if not exists cns_study_questions_subject_idx
  on public.cns_study_questions(subject_id, status);
create index if not exists cns_study_questions_topic_idx
  on public.cns_study_questions(topic_id, status);
create index if not exists cns_study_questions_tags_idx
  on public.cns_study_questions using gin(tags);
create index if not exists cns_study_questions_fts_idx
  on public.cns_study_questions using gin(to_tsvector('english', coalesce(stem,'') || ' ' || coalesce(model_answer,'')));

alter table public.cns_study_questions enable row level security;

-- Read: any signed-in user sees published revision content (stem + model answer
-- both — there is nothing to hide here). Staff see everything.
drop policy if exists "cns study read" on public.cns_study_questions;
create policy "cns study read"
  on public.cns_study_questions for select to authenticated
  using (status = 'published' or public.cns_is_staff());

-- Write: staff only.
drop policy if exists "cns study write" on public.cns_study_questions;
create policy "cns study write"
  on public.cns_study_questions for all to authenticated
  using (public.cns_is_staff()) with check (public.cns_is_staff());

-- --- verification --------------------------------------------------------
select
  (select count(*) from pg_policies where tablename = 'cns_study_questions') as policy_count,
  has_table_privilege('authenticated', 'public.cns_study_questions', 'SELECT') as authed_can_select;

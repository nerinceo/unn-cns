-- !! SUPERSEDED READ POLICIES (2026-10-11): the "cns study read" /
-- !! "cns questions readable" / "cns options readable" policies below were
-- !! OPEN to every signed-in member. HUB migrations 0081 + 0082
-- !! (unn-platform/supabase/migrations) replaced them with paid-access rules.
-- !! Re-running this file REOPENS the paywall — re-run 0082 afterwards.

-- ===========================================================================
-- CNS — Question Bank (multi-university).
--
-- NAMESPACE. Every table is prefixed `cns_` and lives in `public`. Public
-- schema rather than a dedicated `cns` schema on purpose: PostgREST cannot
-- embed resources ACROSS schemas, and nearly every CNS read needs to embed
-- public.users (question author, attempt owner). A separate schema would turn
-- each list view into two round-trips plus a manual join, and would force a
-- second supabase client bound to that schema. The prefix also matches house
-- style — taplet_*, marketplace_*, unit_*, capsee_*, nubo_* are all
-- prefix-namespaced modules in public.
--
-- ISOLATION CONTRACT. Purely additive. Nothing here alters, drops or
-- re-policies an existing table. The only coupling to HUB is an inbound
-- foreign key to public.users(id), which cannot affect HUB reads or writes.
-- FKs point at public.users, never public.profiles — profiles.id is a
-- standalone uuid, NOT the auth user id.
--
-- MULTI-TENANCY. institution_id is NULLABLE on the content taxonomy:
--   NULL     => shared across every institution (a pharmacology MCQ is the
--               same question at RGUHS and KUHS)
--   NOT NULL => institution-specific (past papers, syllabus-mapped subjects)
-- Designed in from day one because retrofitting tenancy is the one migration
-- that cannot be done additively.
--
-- ANSWER-KEY SECRECY. RLS filters ROWS, not COLUMNS. A learner who can read a
-- published question can read every column of it — including is_correct —
-- straight from PostgREST, before submitting. Stripping the field in a server
-- action does NOT fix that. Section 9 revokes column-level SELECT instead, and
-- grading happens in a SECURITY DEFINER function. See the note there before
-- writing any client code against these tables.
--
-- Run manually in Supabase Dashboard > SQL Editor (per project convention).
-- Safe to re-run: CREATE IF NOT EXISTS + DROP POLICY IF EXISTS throughout.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Tenancy
-- ---------------------------------------------------------------------------
create table if not exists public.cns_institutions (
  id uuid default uuid_generate_v4() primary key,
  slug text unique not null,                       -- 'rguhs', 'kuhs'
  name text not null,
  short_name text,                                 -- 'RGUHS'
  country text not null default 'IN',
  institution_type text not null default 'university'
    check (institution_type in ('university','college','board','council')),
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- institution_id NULL => a generic program definition ('B.Sc Nursing') that
-- any institution's subjects can point at.
create table if not exists public.cns_programs (
  id uuid default uuid_generate_v4() primary key,
  institution_id uuid references public.cns_institutions(id) on delete cascade,
  slug text not null,
  name text not null,
  duration_years int,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 2. Content taxonomy: subject -> topic (self-nesting)
-- ---------------------------------------------------------------------------
create table if not exists public.cns_subjects (
  id uuid default uuid_generate_v4() primary key,
  institution_id uuid references public.cns_institutions(id) on delete cascade,
  program_id uuid references public.cns_programs(id) on delete set null,
  slug text not null,
  name text not null,                              -- 'Medical-Surgical Nursing'
  year_of_study int,
  semester int,
  description text,
  icon text,
  position int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists public.cns_topics (
  id uuid default uuid_generate_v4() primary key,
  subject_id uuid references public.cns_subjects(id) on delete cascade not null,
  parent_id uuid references public.cns_topics(id) on delete cascade,
  slug text not null,
  name text not null,
  position int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 3. Questions
--
-- answer_key holds correct answers for the non-option types (fill_blank,
-- short_answer, match); option-based types use cns_question_options.
-- source_ref is the stable id from an import source so re-running an import
-- updates rather than duplicates (see the unique partial index in section 8).
-- ---------------------------------------------------------------------------
create table if not exists public.cns_questions (
  id uuid default uuid_generate_v4() primary key,
  institution_id uuid references public.cns_institutions(id) on delete set null,
  subject_id uuid references public.cns_subjects(id) on delete cascade not null,
  topic_id uuid references public.cns_topics(id) on delete set null,
  question_type text not null default 'mcq_single'
    check (question_type in ('mcq_single','mcq_multi','true_false',
                             'assertion_reason','fill_blank','short_answer','match')),
  stem text not null,
  stem_media jsonb default '[]',                   -- [{url,alt,type}] on R2
  explanation text,
  explanation_media jsonb default '[]',
  answer_key jsonb,                                -- SECRET. Revoked in section 9.
  difficulty text not null default 'medium'
    check (difficulty in ('easy','medium','hard')),
  marks numeric(5,2) not null default 1,
  negative_marks numeric(5,2) not null default 0,
  source_exam_year int,
  source_ref text,
  tags text[] default '{}',
  status text not null default 'draft'
    check (status in ('draft','review','published','archived')),
  created_by uuid references public.users(id) on delete set null,
  import_batch_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.cns_question_options (
  id uuid default uuid_generate_v4() primary key,
  question_id uuid references public.cns_questions(id) on delete cascade not null,
  position int not null default 0,
  option_text text not null,
  option_media jsonb default '[]',
  is_correct boolean not null default false,       -- SECRET. Revoked in section 9.
  option_explanation text,                         -- SECRET (reveals the answer).
  unique (question_id, position)
);

-- ---------------------------------------------------------------------------
-- 4. Question sets / papers
--
-- access_type + marketplace_listing_id are how a paid question bank bought in
-- the HUB marketplace unlocks here. 'entitled' sets stay locked until
-- public.user_digital_entitlements shows the viewer owns the listing — see
-- cns_entitlements.sql. Nothing to sync: entitlement is a read, so a set
-- unlocks the moment fulfillCheckoutSession() flips the order to 'paid'.
-- ---------------------------------------------------------------------------
create table if not exists public.cns_question_sets (
  id uuid default uuid_generate_v4() primary key,
  institution_id uuid references public.cns_institutions(id) on delete cascade,
  subject_id uuid references public.cns_subjects(id) on delete cascade,
  slug text not null,
  title text not null,
  description text,
  set_type text not null default 'practice'
    check (set_type in ('practice','mock','past_paper','daily','custom')),
  exam_year int,
  duration_minutes int,
  total_marks numeric(7,2),
  pass_percentage numeric(5,2),
  shuffle_questions boolean not null default false,
  shuffle_options boolean not null default false,
  show_answers_mode text not null default 'after_submit'
    check (show_answers_mode in ('immediately','after_submit','never')),
  access_type text not null default 'free'
    check (access_type in ('free','entitled')),
  marketplace_listing_id uuid,                     -- FK deliberately omitted; see below
  free_sample_count int not null default 5,        -- questions visible while locked
  is_published boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now()
);

-- NOTE on marketplace_listing_id: intentionally NOT a foreign key to
-- public.marketplace_listings. A hard FK would couple CNS to a HUB table that
-- is actively churning (variants, coupons, chargebacks) and would let a
-- listing deletion cascade into curated question-bank content. Validity is
-- checked at authoring time in the admin instead.

create table if not exists public.cns_question_set_items (
  id uuid default uuid_generate_v4() primary key,
  set_id uuid references public.cns_question_sets(id) on delete cascade not null,
  question_id uuid references public.cns_questions(id) on delete cascade not null,
  position int not null default 0,
  marks_override numeric(5,2),
  unique (set_id, question_id)
);

-- ---------------------------------------------------------------------------
-- 5. Attempts + responses
--
-- question_ids freezes the order (and the shuffle) at start time, so a set
-- edited mid-attempt does not change what the learner is answering.
-- set_id NULL = free practice scoped to a subject/topic rather than a paper.
-- ---------------------------------------------------------------------------
create table if not exists public.cns_attempts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  set_id uuid references public.cns_question_sets(id) on delete set null,
  subject_id uuid references public.cns_subjects(id) on delete set null,
  topic_id uuid references public.cns_topics(id) on delete set null,
  mode text not null default 'practice'
    check (mode in ('practice','timed','exam')),
  status text not null default 'in_progress'
    check (status in ('in_progress','submitted','abandoned','expired')),
  question_ids uuid[] not null default '{}',
  total_questions int not null default 0,
  correct_count int not null default 0,
  wrong_count int not null default 0,
  skipped_count int not null default 0,
  score numeric(7,2) not null default 0,
  max_score numeric(7,2) not null default 0,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  duration_seconds int
);

create table if not exists public.cns_attempt_responses (
  id uuid default uuid_generate_v4() primary key,
  attempt_id uuid references public.cns_attempts(id) on delete cascade not null,
  question_id uuid references public.cns_questions(id) on delete cascade not null,
  selected_option_ids uuid[] default '{}',
  answer_text text,
  -- Written ONLY by the grading function. The own-row policy in section 9
  -- deliberately does not let a learner UPDATE these.
  is_correct boolean,
  marks_awarded numeric(5,2) not null default 0,
  time_spent_seconds int not null default 0,
  flagged boolean not null default false,
  answered_at timestamptz default now(),
  unique (attempt_id, question_id)
);

-- ---------------------------------------------------------------------------
-- 6. Progress + analytics
-- ---------------------------------------------------------------------------
create table if not exists public.cns_user_topic_progress (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  topic_id uuid references public.cns_topics(id) on delete cascade not null,
  subject_id uuid references public.cns_subjects(id) on delete cascade,
  questions_seen int not null default 0,
  questions_correct int not null default 0,
  mastery numeric(5,2) not null default 0,         -- 0..100
  streak_days int not null default 0,
  last_practiced_at timestamptz,
  unique (user_id, topic_id)
);

create table if not exists public.cns_question_stats (
  question_id uuid primary key references public.cns_questions(id) on delete cascade,
  attempts_count int not null default 0,
  correct_count int not null default 0,
  avg_time_seconds numeric(7,2) not null default 0,
  difficulty_index numeric(5,4),                   -- correct / attempts
  updated_at timestamptz default now()
);

create table if not exists public.cns_bookmarks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  question_id uuid references public.cns_questions(id) on delete cascade not null,
  note text,
  created_at timestamptz default now(),
  unique (user_id, question_id)
);

-- ---------------------------------------------------------------------------
-- 7. Import audit
-- ---------------------------------------------------------------------------
create table if not exists public.cns_import_batches (
  id uuid default uuid_generate_v4() primary key,
  institution_id uuid references public.cns_institutions(id) on delete set null,
  source text not null,                            -- 'rguhs-prototype', 'csv'
  source_detail text,
  row_count int not null default 0,
  inserted_count int not null default 0,
  updated_count int not null default 0,
  error_count int not null default 0,
  errors jsonb default '[]',
  status text not null default 'pending'
    check (status in ('pending','running','completed','failed')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 8. Indexes and uniqueness
--
-- Partial unique indexes rather than table constraints, because the tenancy
-- columns are nullable and NULLs do not collide in a plain UNIQUE.
-- ---------------------------------------------------------------------------
create unique index if not exists cns_programs_slug_idx
  on public.cns_programs(coalesce(institution_id,'00000000-0000-0000-0000-000000000000'::uuid), slug);
create unique index if not exists cns_subjects_slug_idx
  on public.cns_subjects(coalesce(institution_id,'00000000-0000-0000-0000-000000000000'::uuid),
                         coalesce(program_id,'00000000-0000-0000-0000-000000000000'::uuid), slug);
create unique index if not exists cns_topics_slug_idx
  on public.cns_topics(subject_id, coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid), slug);
create unique index if not exists cns_sets_slug_idx
  on public.cns_question_sets(coalesce(institution_id,'00000000-0000-0000-0000-000000000000'::uuid), slug);

-- Re-running an import updates rather than duplicates.
create unique index if not exists cns_questions_source_ref_idx
  on public.cns_questions(institution_id, source_ref) where source_ref is not null;

create index if not exists cns_subjects_inst_idx
  on public.cns_subjects(institution_id, is_published, position);
create index if not exists cns_topics_subject_idx
  on public.cns_topics(subject_id, position);
create index if not exists cns_questions_subject_idx
  on public.cns_questions(subject_id, status, difficulty);
create index if not exists cns_questions_topic_idx
  on public.cns_questions(topic_id, status);
create index if not exists cns_questions_tags_idx
  on public.cns_questions using gin(tags);
create index if not exists cns_question_options_q_idx
  on public.cns_question_options(question_id, position);
create index if not exists cns_set_items_set_idx
  on public.cns_question_set_items(set_id, position);
create index if not exists cns_attempts_user_idx
  on public.cns_attempts(user_id, started_at desc);
create index if not exists cns_attempts_set_idx
  on public.cns_attempts(set_id, status);
create index if not exists cns_responses_attempt_idx
  on public.cns_attempt_responses(attempt_id);
create index if not exists cns_progress_user_idx
  on public.cns_user_topic_progress(user_id, last_practiced_at desc);

-- Full-text search over stems, mirroring marketplace_search_fts.sql.
create index if not exists cns_questions_fts_idx
  on public.cns_questions
  using gin(to_tsvector('english', coalesce(stem,'') || ' ' || coalesce(explanation,'')));

-- ---------------------------------------------------------------------------
-- 9. Row Level Security
--
-- Content: any authenticated member reads PUBLISHED rows; only platform staff
-- write (same posture as public.taplets).
-- Learner rows: strictly own-row.
-- ---------------------------------------------------------------------------
alter table public.cns_institutions        enable row level security;
alter table public.cns_programs            enable row level security;
alter table public.cns_subjects            enable row level security;
alter table public.cns_topics              enable row level security;
alter table public.cns_questions           enable row level security;
alter table public.cns_question_options    enable row level security;
alter table public.cns_question_sets       enable row level security;
alter table public.cns_question_set_items  enable row level security;
alter table public.cns_attempts            enable row level security;
alter table public.cns_attempt_responses   enable row level security;
alter table public.cns_user_topic_progress enable row level security;
alter table public.cns_question_stats      enable row level security;
alter table public.cns_bookmarks           enable row level security;
alter table public.cns_import_batches      enable row level security;

-- --- content: read ---------------------------------------------------------
drop policy if exists "cns institutions readable" on public.cns_institutions;
create policy "cns institutions readable"
  on public.cns_institutions for select to authenticated using (is_active = true);

drop policy if exists "cns programs readable" on public.cns_programs;
create policy "cns programs readable"
  on public.cns_programs for select to authenticated using (is_active = true);

drop policy if exists "cns subjects readable" on public.cns_subjects;
create policy "cns subjects readable"
  on public.cns_subjects for select to authenticated using (is_published = true);

drop policy if exists "cns topics readable" on public.cns_topics;
create policy "cns topics readable"
  on public.cns_topics for select to authenticated using (is_published = true);

drop policy if exists "cns questions readable" on public.cns_questions;
create policy "cns questions readable"
  on public.cns_questions for select to authenticated using (status = 'published');

drop policy if exists "cns options readable" on public.cns_question_options;
create policy "cns options readable"
  on public.cns_question_options for select to authenticated
  using (exists (select 1 from public.cns_questions q
                 where q.id = question_id and q.status = 'published'));

drop policy if exists "cns sets readable" on public.cns_question_sets;
create policy "cns sets readable"
  on public.cns_question_sets for select to authenticated using (is_published = true);

drop policy if exists "cns set items readable" on public.cns_question_set_items;
create policy "cns set items readable"
  on public.cns_question_set_items for select to authenticated
  using (exists (select 1 from public.cns_question_sets s
                 where s.id = set_id and s.is_published = true));

drop policy if exists "cns question stats readable" on public.cns_question_stats;
create policy "cns question stats readable"
  on public.cns_question_stats for select to authenticated using (true);

-- --- content: staff write --------------------------------------------------
-- One `for all` staff policy per content table. The role check is inlined
-- rather than factored into a helper function, matching taplets.sql, so this
-- migration stays self-contained and re-runnable.
do $$
declare t text;
begin
  foreach t in array array[
    'cns_institutions','cns_programs','cns_subjects','cns_topics',
    'cns_questions','cns_question_options','cns_question_sets',
    'cns_question_set_items','cns_import_batches'
  ] loop
    execute format('drop policy if exists "cns staff manage %1$s" on public.%1$I', t);
    execute format($f$
      create policy "cns staff manage %1$s" on public.%1$I
        for all to authenticated
        using (exists (select 1 from public.users u
                       where u.id = auth.uid()
                         and u.role in ('platform_admin','platform_moderator')))
        with check (exists (select 1 from public.users u
                            where u.id = auth.uid()
                              and u.role in ('platform_admin','platform_moderator')))
    $f$, t);
  end loop;
end $$;

-- --- learner-owned rows ----------------------------------------------------
drop policy if exists "cns own attempts" on public.cns_attempts;
create policy "cns own attempts"
  on public.cns_attempts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- SELECT and INSERT only. A learner must not be able to UPDATE is_correct or
-- marks_awarded on their own response — grading is the definer function's job.
drop policy if exists "cns own responses read" on public.cns_attempt_responses;
create policy "cns own responses read"
  on public.cns_attempt_responses for select to authenticated
  using (exists (select 1 from public.cns_attempts a
                 where a.id = attempt_id and a.user_id = auth.uid()));

drop policy if exists "cns own responses write" on public.cns_attempt_responses;
create policy "cns own responses write"
  on public.cns_attempt_responses for insert to authenticated
  with check (exists (select 1 from public.cns_attempts a
                      where a.id = attempt_id and a.user_id = auth.uid()
                        and a.status = 'in_progress'));

-- Answer changes before submission: allowed, but only the answer columns
-- matter — is_correct/marks_awarded are set by the grader, and a learner
-- flipping them is harmless because the grader overwrites on submit.
drop policy if exists "cns own responses update" on public.cns_attempt_responses;
create policy "cns own responses update"
  on public.cns_attempt_responses for update to authenticated
  using (exists (select 1 from public.cns_attempts a
                 where a.id = attempt_id and a.user_id = auth.uid()
                   and a.status = 'in_progress'));

drop policy if exists "cns own progress" on public.cns_user_topic_progress;
create policy "cns own progress"
  on public.cns_user_topic_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "cns own bookmarks" on public.cns_bookmarks;
create policy "cns own bookmarks"
  on public.cns_bookmarks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --- answer-key secrecy ----------------------------------------------------
-- THE important part of this file.
--
-- The policies above let any authenticated member SELECT a published question
-- and its options. RLS cannot restrict that to a subset of columns, so without
-- what follows, `select is_correct from cns_question_options` through
-- PostgREST hands out the entire answer key before the learner submits.
--
-- Column-level GRANTs are the enforceable fix: PostgREST errors when a revoked
-- column is selected. Grading therefore has to run as the definer function
-- below (or service role), never in client code.
--
-- ORDER MATTERS AND IS EASY TO GET WRONG. A column-level REVOKE is a NO-OP
-- while a table-level SELECT grant exists — Postgres just warns "no privileges
-- could be revoked for column" and the column stays readable. Supabase grants
-- table-level SELECT to anon/authenticated by default, so the blanket grant
-- must be dropped FIRST and the readable columns then re-granted explicitly.
revoke select on public.cns_question_options from anon, authenticated;
revoke select on public.cns_questions        from anon, authenticated;

grant select (id, question_id, position, option_text, option_media)
  on public.cns_question_options to authenticated;
grant select (id, institution_id, subject_id, topic_id, question_type, stem,
              stem_media, explanation, explanation_media, difficulty, marks,
              negative_marks, source_exam_year, source_ref, tags, status,
              created_by, import_batch_id, created_at, updated_at)
  on public.cns_questions to authenticated;

-- service_role is untouched above (it keeps its table-level grant) so the
-- importer and admin tooling still read every column.

-- ---------------------------------------------------------------------------
-- 10. Grading
--
-- SECURITY DEFINER so it can read the revoked answer columns. It asserts the
-- caller owns the attempt before doing anything, and search_path is pinned to
-- stop a caller-controlled schema shadowing the tables it touches.
-- ---------------------------------------------------------------------------
create or replace function public.cns_submit_attempt(p_attempt_id uuid)
returns public.cns_attempts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.cns_attempts;
  r record;
  v_correct int := 0;
  v_wrong int := 0;
  v_skipped int := 0;
  v_score numeric(7,2) := 0;
  v_max numeric(7,2) := 0;
begin
  select * into a from public.cns_attempts where id = p_attempt_id;
  if not found then
    raise exception 'attempt not found' using errcode = '42704';
  end if;
  -- Ownership check. Without this, SECURITY DEFINER would let any caller
  -- grade (and read the answers of) anyone else's attempt.
  if a.user_id <> auth.uid() then
    raise exception 'not your attempt' using errcode = '42501';
  end if;
  if a.status <> 'in_progress' then
    return a;                                    -- idempotent re-submit
  end if;

  for r in
    select q.id,
           q.question_type,
           coalesce(i.marks_override, q.marks) as marks,
           q.negative_marks,
           resp.id as response_id,
           resp.selected_option_ids,
           resp.answer_text,
           q.answer_key
    from unnest(a.question_ids) with ordinality as qq(qid, ord)
    join public.cns_questions q on q.id = qq.qid
    left join public.cns_question_set_items i
           on i.question_id = q.id and i.set_id = a.set_id
    left join public.cns_attempt_responses resp
           on resp.attempt_id = a.id and resp.question_id = q.id
    order by qq.ord
  loop
    v_max := v_max + r.marks;

    if r.response_id is null
       or (coalesce(array_length(r.selected_option_ids, 1), 0) = 0
           and coalesce(r.answer_text, '') = '') then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    declare
      v_is_correct boolean;
      v_expected uuid[];
    begin
      if r.question_type in ('mcq_single','mcq_multi','true_false','assertion_reason') then
        select coalesce(array_agg(o.id order by o.id), '{}'::uuid[])
          into v_expected
          from public.cns_question_options o
         where o.question_id = r.id and o.is_correct;
        -- Set equality: every correct option chosen and nothing else. Both
        -- sides are sorted so ordering of the learner's taps cannot matter.
        -- Explicit ::uuid[] casts — an untyped '{}' is ambiguous here.
        v_is_correct := (
          select coalesce(array_agg(distinct x order by x), '{}'::uuid[])
            from unnest(r.selected_option_ids) as x
        ) = v_expected;
      else
        -- Free-text types: case-insensitive match against any accepted answer
        -- in answer_key.accepted (a jsonb array of strings).
        v_is_correct := exists (
          select 1
            from jsonb_array_elements_text(coalesce(r.answer_key->'accepted', '[]'::jsonb)) k
           where lower(btrim(k)) = lower(btrim(coalesce(r.answer_text, '')))
        );
      end if;

      if v_is_correct then
        v_correct := v_correct + 1;
        v_score := v_score + r.marks;
      else
        v_wrong := v_wrong + 1;
        v_score := v_score - r.negative_marks;
      end if;

      update public.cns_attempt_responses
         set is_correct = v_is_correct,
             marks_awarded = case when v_is_correct then r.marks else -r.negative_marks end
       where id = r.response_id;
    end;
  end loop;

  update public.cns_attempts
     set status = 'submitted',
         submitted_at = now(),
         duration_seconds = greatest(0, extract(epoch from (now() - started_at))::int),
         total_questions = coalesce(array_length(question_ids, 1), 0),
         correct_count = v_correct,
         wrong_count = v_wrong,
         skipped_count = v_skipped,
         -- Negative marking must not produce a negative total.
         score = greatest(0, v_score),
         max_score = v_max
   where id = a.id
  returning * into a;

  -- Topic mastery, aggregated on write so dashboards never scan responses.
  insert into public.cns_user_topic_progress
        (user_id, topic_id, subject_id, questions_seen, questions_correct, mastery, last_practiced_at)
  select a.user_id, q.topic_id, q.subject_id, count(*),
         count(*) filter (where resp.is_correct),
         round(100.0 * count(*) filter (where resp.is_correct) / nullif(count(*), 0), 2),
         now()
    from public.cns_attempt_responses resp
    join public.cns_questions q on q.id = resp.question_id
   where resp.attempt_id = a.id and q.topic_id is not null
   group by q.topic_id, q.subject_id
  on conflict (user_id, topic_id) do update
     set questions_seen    = public.cns_user_topic_progress.questions_seen + excluded.questions_seen,
         questions_correct = public.cns_user_topic_progress.questions_correct + excluded.questions_correct,
         mastery = round(100.0 * (public.cns_user_topic_progress.questions_correct + excluded.questions_correct)
                         / nullif(public.cns_user_topic_progress.questions_seen + excluded.questions_seen, 0), 2),
         last_practiced_at = now();

  -- Item analysis.
  insert into public.cns_question_stats (question_id, attempts_count, correct_count, difficulty_index, updated_at)
  select resp.question_id, 1, case when resp.is_correct then 1 else 0 end,
         case when resp.is_correct then 1.0 else 0.0 end, now()
    from public.cns_attempt_responses resp
   where resp.attempt_id = a.id
  on conflict (question_id) do update
     set attempts_count = public.cns_question_stats.attempts_count + 1,
         correct_count  = public.cns_question_stats.correct_count + excluded.correct_count,
         difficulty_index = round(
           (public.cns_question_stats.correct_count + excluded.correct_count)::numeric
           / nullif(public.cns_question_stats.attempts_count + 1, 0), 4),
         updated_at = now();

  return a;
end;
$$;

revoke all on function public.cns_submit_attempt(uuid) from public, anon;
grant execute on function public.cns_submit_attempt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Post-submission review
--
-- The learner must see the answer key AFTER submitting, but the columns are
-- revoked. This definer function is the only way they get it, and only for a
-- submitted attempt they own.
-- ---------------------------------------------------------------------------
create or replace function public.cns_attempt_review(p_attempt_id uuid)
returns table (
  question_id uuid,
  correct_option_ids uuid[],
  answer_key jsonb,
  explanation text,
  is_correct boolean,
  marks_awarded numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.cns_attempts;
begin
  select * into a from public.cns_attempts where id = p_attempt_id;
  if not found or a.user_id <> auth.uid() then
    raise exception 'not your attempt' using errcode = '42501';
  end if;
  if a.status <> 'submitted' then
    raise exception 'attempt not submitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.cns_question_sets s
              where s.id = a.set_id and s.show_answers_mode = 'never') then
    raise exception 'answers not available for this set' using errcode = '42501';
  end if;

  return query
    select q.id,
           (select coalesce(array_agg(o.id order by o.position), '{}')
              from public.cns_question_options o
             where o.question_id = q.id and o.is_correct),
           q.answer_key,
           q.explanation,
           resp.is_correct,
           resp.marks_awarded
      from public.cns_attempt_responses resp
      join public.cns_questions q on q.id = resp.question_id
     where resp.attempt_id = a.id;
end;
$$;

revoke all on function public.cns_attempt_review(uuid) from public, anon;
grant execute on function public.cns_attempt_review(uuid) to authenticated;

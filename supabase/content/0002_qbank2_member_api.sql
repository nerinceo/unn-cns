-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
--
-- Question Bank Pro, 2026-10-14 (Naveen): the nerusalem.in bank, copied
-- exactly into schema qbank2 (see D:\2026\_backups\qbank2-import), served by
-- CNS at /question-bank/rguhs-pro as a pixel copy of that site.
--
-- The copied pages call the source project's functions straight from the
-- browser with its anon key. Here nothing in qbank2 is reachable from the
-- Data API: CNS calls the functions below with the server key, after checking
-- the member's purchase in the main project. So:
--
--   qbank2_page            one copied nerusalem.in page (qbank2.site_pages)
--   qbank2_rpc             the 12 read functions the pages call, by name, with
--                          the exact JSON PostgREST would have returned
--   qbank2_exam_semester   which semester a mock / viva exam belongs to (paywall)
--   qbank2_sample_exams    the free sample exam per semester
--   qbank2_attempt_*       mock exam attempts for MAIN-project members
--
-- Adds; changes nothing that exists. The copied qb_* submission tables stay as
-- they are: qb_viva_exam_submissions references auth.users of THIS project,
-- which has no members, so attempts get their own table keyed by the main
-- project's user id.
--
-- Server key only. The explicit REVOKEs are load-bearing: this project's
-- default privileges grant EXECUTE on new functions to anon.
-- ===========================================================================

-- 1. Mock exam attempts. Submitting reveals the answer key (Naveen,
--    2026-10-14: "after they submit we will reveal the answers, let them
--    evaluate on their own"); the self score is the member's own.
create table if not exists qbank2.member_exam_attempts (
  user_id uuid not null,               -- main project auth.users id (no FK: other project)
  kind text not null check (kind in ('written', 'viva')),
  exam_id bigint not null,
  semester integer not null check (semester between 1 and 8),
  submitted_at timestamptz not null default now(),
  self_score numeric check (self_score >= 0),
  max_score numeric not null check (max_score > 0),
  score_saved_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, exam_id),
  check (self_score is null or self_score <= max_score)
);
comment on table qbank2.member_exam_attempts is
  'Question Bank Pro mock exams taken by main-project members (CNS writes these with the server key).';
alter table qbank2.member_exam_attempts enable row level security;
revoke all on qbank2.member_exam_attempts from public, anon, authenticated;
grant all on qbank2.member_exam_attempts to service_role;

-- 2. One copied page, byte-exact.
create or replace function public.qbank2_page(p_path text)
returns table (html text, sha256 text, taplet_semester integer)
language sql stable security invoker
set search_path = ''
as $$
  select p.html, p.sha256, t.semester
    from qbank2.site_pages p
    left join qbank2.taplet_papers t on t.source_path = p.path
   where p.path = p_path;
$$;

-- 3. The read functions the pages call, dispatched by name. Each branch
--    passes the arguments exactly as PostgREST would: a key present in the
--    request (even as null) is passed; an absent key takes the function's own
--    default. Set-returning functions come back as a JSON array in their
--    original row order, scalar jsonb as itself — the shapes the pages parse.
create or replace function public.qbank2_rpc(p_fn text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  a jsonb := coalesce(p_args, '{}'::jsonb);
  r jsonb;
  codes text[];
begin
  case p_fn
  when 'model_question_filter_options_v1' then
    r := qbank2.model_question_filter_options_v1(
      (a->>'p_semester')::integer,
      case when a ? 'p_subject' then a->>'p_subject' else null end);

  when 'model_questions_page_v1' then
    select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) into r
      from qbank2.model_questions_page_v1(
        (a->>'p_semester')::integer,
        a->>'p_subject',
        case when a ? 'p_unit' then a->>'p_unit' else null end,
        case when a ? 'p_type' then a->>'p_type' else null end,
        case when a ? 'p_marks' then (a->>'p_marks')::integer else null end,
        case when a ? 'p_drawing' then (a->>'p_drawing')::boolean else false end,
        case when a ? 'p_search' then a->>'p_search' else null end,
        case when a ? 'p_limit' then (a->>'p_limit')::integer else 30 end,
        case when a ? 'p_offset' then (a->>'p_offset')::integer else 0 end
      ) with ordinality x;

  when 'get_previous_question_subjects' then
    select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) into r
      from qbank2.get_previous_question_subjects((a->>'p_semester')::integer) with ordinality x;

  when 'get_previous_questions_page' then
    if jsonb_typeof(a->'p_subject_codes') = 'array' then
      select array_agg(v) into codes from jsonb_array_elements_text(a->'p_subject_codes') v;
      codes := coalesce(codes, '{}'::text[]);
    end if;
    select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) into r
      from qbank2.get_previous_questions_page(
        (a->>'p_semester')::integer,
        codes,
        case when a ? 'p_search' then a->>'p_search' else '' end,
        case when a ? 'p_offset' then (a->>'p_offset')::integer else 0 end,
        case when a ? 'p_limit' then (a->>'p_limit')::integer else 25 end
      ) with ordinality x;

  when 'miq_filter_options' then
    r := qbank2.miq_filter_options((a->>'p_semester')::integer);

  when 'miq_search' then
    select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) into r
      from qbank2.miq_search(
        (a->>'p_semester')::integer,
        case when a ? 'p_subject' then a->>'p_subject' else null end,
        case when a ? 'p_type' then a->>'p_type' else null end,
        case when a ? 'p_marks' then (a->>'p_marks')::integer else null end,
        case when a ? 'p_drawing' then (a->>'p_drawing')::boolean else false end,
        case when a ? 'p_search' then a->>'p_search' else null end,
        case when a ? 'p_limit' then (a->>'p_limit')::integer else 30 end,
        case when a ? 'p_offset' then (a->>'p_offset')::integer else 0 end,
        case when a ? 'p_priority' then a->>'p_priority' else null end,
        case when a ? 'p_source' then a->>'p_source' else null end
      ) with ordinality x;

  when 'get_written_exam_catalog' then
    select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) into r
      from qbank2.get_written_exam_catalog() with ordinality x;

  when 'get_viva_exam_catalog' then
    select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) into r
      from qbank2.get_viva_exam_catalog() with ordinality x;

  when 'get_written_exam_paper' then
    select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) into r
      from qbank2.get_written_exam_paper((a->>'p_mock_exam_id')::bigint) with ordinality x;

  when 'get_mock_exam_answer_key' then
    select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) into r
      from qbank2.get_mock_exam_answer_key((a->>'p_mock_exam_id')::bigint) with ordinality x;

  when 'get_viva_exam_questions' then
    select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) into r
      from qbank2.get_viva_exam_questions((a->>'p_viva_exam_id')::bigint) with ordinality x;

  when 'get_viva_exam_answer_key' then
    select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) into r
      from qbank2.get_viva_exam_answer_key((a->>'p_viva_exam_id')::bigint) with ordinality x;

  else
    raise exception 'qbank2_rpc: unknown function %', p_fn using errcode = '22023';
  end case;
  return r;
end;
$$;

-- 4. The paywall needs an exam's semester and its free sample.
create or replace function public.qbank2_exam_semester(p_kind text, p_exam_id bigint)
returns table (semester integer, max_score numeric)
language sql stable security invoker
set search_path = ''
as $$
  select m.semester, m.total_marks::numeric from qbank2.qb_mock_exams m
   where p_kind = 'written' and m.id = p_exam_id
  union all
  select v.semester, v.total_questions::numeric from qbank2.qb_viva_exams v
   where p_kind = 'viva' and v.id = p_exam_id;
$$;

-- The first written mock and the first viva of each semester are free samples.
create or replace function public.qbank2_sample_exams()
returns table (kind text, semester integer, exam_id bigint)
language sql stable security invoker
set search_path = ''
as $$
  select 'written', m.semester, min(m.id) from qbank2.qb_mock_exams m group by m.semester
  union all
  select 'viva', v.semester, min(v.id) from qbank2.qb_viva_exams v group by v.semester;
$$;

-- 5. Attempts. CNS has already checked that the member may open this exam.
create or replace function public.qbank2_attempt_get(p_user uuid, p_kind text, p_exam_id bigint)
returns setof qbank2.member_exam_attempts
language sql stable security invoker
set search_path = ''
as $$
  select * from qbank2.member_exam_attempts
   where user_id = p_user and kind = p_kind and exam_id = p_exam_id;
$$;

-- Submitting twice keeps the first time: the record is "when did they finish".
create or replace function public.qbank2_attempt_submit(p_user uuid, p_kind text, p_exam_id bigint)
returns setof qbank2.member_exam_attempts
language plpgsql security invoker
set search_path = ''
as $$
declare
  e record;
begin
  select * into e from public.qbank2_exam_semester(p_kind, p_exam_id);
  if e.semester is null then
    raise exception 'Exam not found' using errcode = 'P0002';
  end if;
  insert into qbank2.member_exam_attempts (user_id, kind, exam_id, semester, max_score)
  values (p_user, p_kind, p_exam_id, e.semester, e.max_score)
  on conflict (user_id, kind, exam_id) do nothing;
  return query select * from qbank2.member_exam_attempts
                where user_id = p_user and kind = p_kind and exam_id = p_exam_id;
end;
$$;

create or replace function public.qbank2_attempt_score(p_user uuid, p_kind text, p_exam_id bigint, p_score numeric)
returns setof qbank2.member_exam_attempts
language plpgsql security invoker
set search_path = ''
as $$
begin
  update qbank2.member_exam_attempts
     set self_score = p_score, score_saved_at = now()
   where user_id = p_user and kind = p_kind and exam_id = p_exam_id;
  if not found then
    raise exception 'Submit the exam before saving a score' using errcode = 'P0002';
  end if;
  return query select * from qbank2.member_exam_attempts
                where user_id = p_user and kind = p_kind and exam_id = p_exam_id;
end;
$$;

-- 6. Server key only.
do $$
declare f text;
begin
  foreach f in array array[
    'public.qbank2_page(text)',
    'public.qbank2_rpc(text, jsonb)',
    'public.qbank2_exam_semester(text, bigint)',
    'public.qbank2_sample_exams()',
    'public.qbank2_attempt_get(uuid, text, bigint)',
    'public.qbank2_attempt_submit(uuid, text, bigint)',
    'public.qbank2_attempt_score(uuid, text, bigint, numeric)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

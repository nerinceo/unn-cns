-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
--
-- Question Bank Pro, 2026-10-15 (Naveen):
--   1. Year filters on Previous Years and Most Important: the years a
--      question appeared in, and repeat patterns over the last 4 exam years
--      ("in all 4 years", 3 of 4, 2 of 4, any of 4, 5+ years overall).
--   2. A progress tracker: Save / Mark done on every question and every
--      mnemonic, revision note and SOS card, progress per semester, section
--      and subject, and "continue where you left off".
--
-- The last-4-years window ends at the latest exam year with full data (at
-- least 300 questions), so a year whose papers are still arriving (2026:
-- 178 so far) doesn't empty the "all 4 years" list; it joins once filled.
--
-- Member rows are keyed by the MAIN project's user id; CNS writes them with
-- the server key after checking the purchase. Server key only throughout.
-- ===========================================================================

-- 1. Exam years ------------------------------------------------------------

create table if not exists qbank2.question_exam_years (
  question_id bigint not null,
  year integer not null,
  primary key (question_id, year)
);
create index if not exists question_exam_years_year on qbank2.question_exam_years (year);
alter table qbank2.question_exam_years enable row level security;
revoke all on qbank2.question_exam_years from public, anon, authenticated;
grant all on qbank2.question_exam_years to service_role;

-- Rebuilt from the occurrences (same sitting rules as 0005); re-run after an import.
create or replace function qbank2.refresh_question_exam_years()
returns integer
language plpgsql
set search_path = ''
as $$
declare n integer;
begin
  delete from qbank2.question_exam_years;
  insert into qbank2.question_exam_years (question_id, year)
  select distinct o.question_id, substring(x.label from '(\d{4})$')::integer
    from qbank2.qb_question_occurrences o
    cross join lateral qbank2.exam_sitting(o.exam_year::text, o.exam_session::text) x
   where o.question_id is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;
select qbank2.refresh_question_exam_years();

-- The last 4 exam years with full data.
create or replace function qbank2.recent_years()
returns integer[]
language sql stable
set search_path = ''
as $$
  with latest as (
    select max(year) y from (select year from qbank2.question_exam_years group by year having count(*) >= 300) f
  )
  select array[y - 3, y - 2, y - 1, y] from latest;
$$;

-- Does a question match the chosen years (any of them) and repeat pattern?
--   all4  every one of the last 4 years      three4  3 or more of them
--   two4  2 or more of them                  any4    at least one of them
--   often 5 or more different years, ever
create or replace function qbank2.year_match(p_question bigint, p_years integer[], p_pattern text)
returns boolean
language sql stable
set search_path = ''
as $$
  with ys as (select array_agg(year) a from qbank2.question_exam_years where question_id = p_question),
  r as (select qbank2.recent_years() w)
  select
    (coalesce(cardinality(p_years), 0) = 0 or coalesce(ys.a, '{}') && p_years)
    and case nullif(p_pattern, '')
      when 'all4' then coalesce(ys.a, '{}') @> r.w
      when 'three4' then cardinality(array(select unnest(coalesce(ys.a, '{}')) intersect select unnest(r.w))) >= 3
      when 'two4' then cardinality(array(select unnest(coalesce(ys.a, '{}')) intersect select unnest(r.w))) >= 2
      when 'any4' then coalesce(ys.a, '{}') && r.w
      when 'often' then cardinality(coalesce(ys.a, '{}')) >= 5
      else true
    end
  from ys, r;
$$;

-- Years and patterns on offer for one semester's section, with counts.
create or replace function public.qbank2_year_options(p_semester integer, p_section text)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with qs as (
    select q.id from qbank2.qb_questions q
     where p_section = 'previous' and q.is_previous_university is true and q.semester_number = p_semester
    union
    select m.question_id from qbank2.qb_most_important_questions m
     where p_section = 'important' and m.is_active is true and m.semester = p_semester
  ),
  r as (select qbank2.recent_years() w)
  select jsonb_build_object(
    'window', (select to_jsonb(w) from r),
    'years', coalesce((
      select jsonb_agg(jsonb_build_object('year', year, 'count', n) order by year desc)
        from (select y.year, count(*) n from qbank2.question_exam_years y join qs on qs.id = y.question_id group by y.year) t
    ), '[]'::jsonb),
    'patterns', jsonb_build_object(
      'all4', (select count(*) from qs where qbank2.year_match(qs.id, null, 'all4')),
      'three4', (select count(*) from qs where qbank2.year_match(qs.id, null, 'three4')),
      'two4', (select count(*) from qs where qbank2.year_match(qs.id, null, 'two4')),
      'any4', (select count(*) from qs where qbank2.year_match(qs.id, null, 'any4')),
      'often', (select count(*) from qs where qbank2.year_match(qs.id, null, 'often'))
    )
  );
$$;

-- Previous Years with the year filters (body as 0005 plus p_years / p_pattern).
drop function if exists qbank2.get_previous_questions_page(integer, text[], text, integer, integer);
drop function if exists qbank2.get_previous_questions_page(integer, text[], text, integer, integer, integer[], text);
create function qbank2.get_previous_questions_page(
  p_semester integer, p_subject_codes text[], p_search text default ''::text,
  p_offset integer default 0, p_limit integer default 25,
  p_years integer[] default null, p_pattern text default null
)
returns table(id bigint, subject_code text, question_type text, marks text, question text, answer text,
  answer_formatted text, option_a text, option_b text, option_c text, option_d text, correct_option text,
  rationale text, exam_tip text, times_asked bigint, years_asked text[], exam_sessions text[], sittings text[],
  total_count bigint)
language sql stable security definer
set search_path to 'qbank2'
as $$
with filtered as (
  select q.*
    from qbank2.qb_questions q
   where q.semester_number = p_semester
     and q.subject_code = any(p_subject_codes)
     and q.is_previous_university = true
     and (coalesce(trim(p_search), '') = '' or q.question ilike '%' || trim(p_search) || '%')
     and (coalesce(cardinality(p_years), 0) = 0 and nullif(p_pattern, '') is null or qbank2.year_match(q.id, p_years, p_pattern))
)
select
  q.id::bigint, q.subject_code::text, q.question_type::text, q.marks::text, q.question::text,
  q.answer::text, q.answer_formatted::text, q.option_a::text, q.option_b::text, q.option_c::text,
  q.option_d::text, q.correct_option::text, q.rationale::text, q.exam_tip::text,
  coalesce(occ.times_asked, 0)::bigint as times_asked,
  coalesce(occ.years_asked, array[]::text[]) as years_asked,
  coalesce(occ.exam_sessions, array[]::text[]) as exam_sessions,
  coalesce(occ.sittings, array[]::text[]) as sittings,
  count(*) over()::bigint as total_count
from filtered q
left join lateral (
  with s as (
    select distinct x.label, x.sort_key
      from qbank2.qb_question_occurrences o
      cross join lateral qbank2.exam_sitting(o.exam_year::text, o.exam_session::text) x
     where o.question_id = q.id
  )
  select count(*)::bigint as times_asked,
         array_agg(label order by sort_key, label) as sittings,
         (select array_agg(distinct nullif(trim(o.exam_year::text), '') order by nullif(trim(o.exam_year::text), ''))
            from qbank2.qb_question_occurrences o where o.question_id = q.id and nullif(trim(o.exam_year::text), '') is not null) as years_asked,
         (select array_agg(distinct nullif(trim(o.exam_session::text), '') order by nullif(trim(o.exam_session::text), ''))
            from qbank2.qb_question_occurrences o where o.question_id = q.id and nullif(trim(o.exam_session::text), '') is not null) as exam_sessions
    from s
) occ on true
order by coalesce(occ.times_asked, 0) desc, q.id asc
offset greatest(p_offset, 0)
limit least(greatest(p_limit, 1), 100);
$$;

-- Most Important with the year filters, and the MCQ options, rationale and
-- tip the source left out (its cards had no options to show).
do $$ begin
  if to_regprocedure('qbank2.miq_search_source(integer, text, text, integer, boolean, text, integer, integer, text, text)') is null then
    alter function qbank2.miq_search(integer, text, text, integer, boolean, text, integer, integer, text, text) rename to miq_search_source;
  end if;
end $$;
drop function if exists qbank2.miq_search(integer, text, text, integer, boolean, text, integer, integer, text, text);
drop function if exists qbank2.miq_search(integer, text, text, integer, boolean, text, integer, integer, text, text, integer[], text);
create function qbank2.miq_search(
  p_semester integer, p_subject text default null, p_type text default null, p_marks integer default null,
  p_drawing boolean default false, p_search text default null, p_limit integer default 30, p_offset integer default 0,
  p_priority text default null, p_source text default null, p_years integer[] default null, p_pattern text default null
)
returns table(question jsonb, total_count bigint)
language sql stable
set search_path to 'qbank2'
as $$
  with matching as materialized (
    select m.id as selection_id, m.question_id, m.importance_rank
      from qbank2.qb_most_important_questions m
      join qbank2.qb_questions q on q.id = m.question_id
     where m.semester = p_semester
       and m.is_active is true
       and (nullif(p_priority, '') is null or m.importance_level = p_priority)
       and (nullif(p_source, '') is null or m.source_group = p_source)
       and (nullif(p_subject, '') is null or q.official_subject_code = p_subject)
       and (nullif(p_type, '') is null or q.question_type = p_type)
       and (p_marks is null or q.marks = p_marks)
       and (p_drawing is not true or q.diagram_needed is true)
       and (nullif(trim(p_search), '') is null or q.question ilike '%' || trim(p_search) || '%')
       and (coalesce(cardinality(p_years), 0) = 0 and nullif(p_pattern, '') is null or qbank2.year_match(q.id, p_years, p_pattern))
  ),
  paged as (
    select selection_id, question_id, importance_rank from matching
     order by importance_rank asc nulls last, selection_id asc
     limit least(greatest(p_limit, 1), 30) offset greatest(p_offset, 0)
  )
  select
    jsonb_build_object(
      'id', q.id, 'question', q.question, 'answer', q.answer, 'answer_formatted', q.answer_formatted,
      'official_subject_code', q.official_subject_code, 'official_subject_name', q.official_subject_name,
      'question_type', q.question_type, 'marks', q.marks, 'diagram_needed', q.diagram_needed,
      'importance_rank', m.importance_rank, 'importance_score', m.importance_score,
      'importance_level', m.importance_level, 'source_group', m.source_group,
      'option_a', q.option_a, 'option_b', q.option_b, 'option_c', q.option_c, 'option_d', q.option_d,
      'correct_option', q.correct_option, 'rationale', q.rationale, 'exam_tip', q.exam_tip
    ) as question,
    (select count(*) from matching) as total_count
  from paged p
  join qbank2.qb_most_important_questions m on m.id = p.selection_id
  join qbank2.qb_questions q on q.id = p.question_id
  order by p.importance_rank asc nulls last, p.selection_id asc;
$$;

-- The dispatcher passes the two new arguments through (other branches as 0002).
create or replace function public.qbank2_rpc(p_fn text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  a jsonb := coalesce(p_args, '{}'::jsonb);
  r jsonb;
  codes text[];
  yrs integer[];
begin
  if jsonb_typeof(a->'p_years') = 'array' then
    select array_agg(v::integer) into yrs from jsonb_array_elements_text(a->'p_years') v where v ~ '^\d{4}$';
  end if;
  case p_fn
  when 'model_question_filter_options_v1' then
    r := qbank2.model_question_filter_options_v1((a->>'p_semester')::integer, case when a ? 'p_subject' then a->>'p_subject' else null end);
  when 'model_questions_page_v1' then
    select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) into r
      from qbank2.model_questions_page_v1(
        (a->>'p_semester')::integer, a->>'p_subject',
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
        (a->>'p_semester')::integer, codes,
        case when a ? 'p_search' then a->>'p_search' else '' end,
        case when a ? 'p_offset' then (a->>'p_offset')::integer else 0 end,
        case when a ? 'p_limit' then (a->>'p_limit')::integer else 25 end,
        yrs, a->>'p_pattern'
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
        case when a ? 'p_source' then a->>'p_source' else null end,
        yrs, a->>'p_pattern'
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

-- Notes and SOS rows carry their table id, which is what progress keys on
-- (a note's or card's own id can repeat across decks).
create or replace function public.qbank2_notes(
  p_semester integer, p_subject text default null, p_unit text default null, p_type text default null,
  p_search text default null, p_limit integer default 24, p_offset integer default 0
)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with base as (select * from qbank2.hack_notes where semester = p_semester),
  hit as (
    select * from base
     where (nullif(p_subject, '') is null or data->>'subject' = p_subject)
       and (nullif(p_unit, '') is null or data->>'unit_code' = p_unit)
       and (nullif(p_type, '') is null or data->>'type' = p_type)
       and (nullif(btrim(p_search), '') is null
            or concat_ws(' ', data->>'topic', data->>'subject', data->>'unit_name', data->'note'::text) ilike '%' || btrim(p_search) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from hit),
    'all', (select count(*) from base),
    'subjects', coalesce((select jsonb_agg(x order by x) from (select distinct data->>'subject' x from base where data ? 'subject') d), '[]'::jsonb),
    'units', coalesce((
      select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'subject', subject) order by code)
        from (select distinct data->>'unit_code' code, data->>'unit_name' name, data->>'subject' subject
                from base where nullif(data->>'unit_code', '') is not null
                  and (nullif(p_subject, '') is null or data->>'subject' = p_subject)) d
    ), '[]'::jsonb),
    'types', coalesce((select jsonb_agg(x order by x) from (select distinct data->>'type' x from base where data ? 'type') d), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(h.data || jsonb_build_object('_id', h.id) order by h.ord)
        from (select * from hit order by ord
               limit least(greatest(coalesce(p_limit, 24), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) h
    ), '[]'::jsonb)
  );
$$;

create or replace function public.qbank2_sos(
  p_deck text, p_category text default null, p_paper text default null,
  p_search text default null, p_limit integer default 60, p_offset integer default 0
)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with deck as (select * from qbank2.hack_sos_decks where source_path = 'exam-hacks/exam-sos/' || p_deck || '.html'),
  base as (select c.* from qbank2.hack_sos_cards c join deck d on d.source_path = c.source_path),
  filtered as (
    select * from base
     where (nullif(p_paper, '') is null or coalesce(data->>'paper_code', 'general') = p_paper)
       and (nullif(btrim(p_search), '') is null
            or concat_ws(' ', data->>'title', data->>'summary', data->>'paper_name', data->>'topic', data->'steps'::text) ilike '%' || btrim(p_search) || '%')
  ),
  hit as (select * from filtered where nullif(p_category, '') is null or data->>'category' = p_category)
  select jsonb_build_object(
    'deck', (select data from deck),
    'total', (select count(*) from hit),
    'all', (select count(*) from base),
    'category_counts', coalesce((select jsonb_object_agg(cat, n) from (select data->>'category' cat, count(*) n from filtered group by 1) c), '{}'::jsonb),
    'papers', coalesce((
      select jsonb_agg(jsonb_build_object('code', code, 'name', name) order by name)
        from (select distinct coalesce(data->>'paper_code', 'general') code, coalesce(data->>'paper_name', 'General exam tips') name from base) p
    ), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(h.data || jsonb_build_object('_id', h.id) order by h.ord)
        from (select * from hit order by ord
               limit least(greatest(coalesce(p_limit, 60), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) h
    ), '[]'::jsonb)
  );
$$;

-- 2. Progress --------------------------------------------------------------

-- kind: 'q' (a question, wherever it is listed), 'mnemonic', 'note', 'sos'.
-- item: the question id or the hack table's id.
create table if not exists qbank2.member_marks (
  user_id uuid not null,
  kind text not null check (kind in ('q', 'mnemonic', 'note', 'sos')),
  item bigint not null,
  saved boolean not null default false,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, item)
);
create index if not exists member_marks_user_updated on qbank2.member_marks (user_id, updated_at desc);
alter table qbank2.member_marks enable row level security;
revoke all on qbank2.member_marks from public, anon, authenticated;
grant all on qbank2.member_marks to service_role;

-- Where the member was last, per semester (0 = the general SOS deck).
create table if not exists qbank2.member_resume (
  user_id uuid not null,
  semester integer not null check (semester between 0 and 8),
  path text not null check (path like '/question-bank/rguhs-pro%' and length(path) <= 400),
  label text not null check (length(label) <= 200),
  updated_at timestamptz not null default now(),
  primary key (user_id, semester)
);
alter table qbank2.member_resume enable row level security;
revoke all on qbank2.member_resume from public, anon, authenticated;
grant all on qbank2.member_resume to service_role;

-- The semester an item belongs to — what CNS checks the purchase against.
-- null semester with found=true is the general SOS deck.
create or replace function public.qbank2_item_semester(p_kind text, p_item bigint)
returns table (found boolean, semester integer)
language sql stable security invoker
set search_path = ''
as $$
  select true, s from (
    select coalesce(q.semester_number, q.official_semester_number) s from qbank2.qb_questions q where p_kind = 'q' and q.id = p_item
    union all select m.semester from qbank2.hack_mnemonics m where p_kind = 'mnemonic' and m.id = p_item
    union all select n.semester from qbank2.hack_notes n where p_kind = 'note' and n.id = p_item
    union all select c.semester from qbank2.hack_sos_cards c where p_kind = 'sos' and c.id = p_item
  ) x limit 1;
$$;

create or replace function public.qbank2_mark_set(p_user uuid, p_kind text, p_item bigint, p_saved boolean, p_done boolean)
returns jsonb
language sql security invoker
set search_path = ''
as $$
  insert into qbank2.member_marks (user_id, kind, item, saved, done)
  values (p_user, p_kind, p_item, coalesce(p_saved, false), coalesce(p_done, false))
  on conflict (user_id, kind, item) do update
     set saved = coalesce(p_saved, qbank2.member_marks.saved),
         done = coalesce(p_done, qbank2.member_marks.done),
         updated_at = now()
  returning jsonb_build_object('saved', saved, 'done', done);
$$;

create or replace function public.qbank2_marks_get(p_user uuid, p_kind text, p_items bigint[])
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(item::text, jsonb_build_object('saved', saved, 'done', done)), '{}'::jsonb)
    from qbank2.member_marks
   where user_id = p_user and kind = p_kind and item = any(p_items) and (saved or done);
$$;

-- Done counts against totals: per semester and section, and per subject for
-- one semester's question sections.
create or replace function public.qbank2_progress(p_user uuid, p_semester integer default null)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with done_q as (select item from qbank2.member_marks where user_id = p_user and kind = 'q' and done),
  done_m as (select item from qbank2.member_marks where user_id = p_user and kind = 'mnemonic' and done),
  done_n as (select item from qbank2.member_marks where user_id = p_user and kind = 'note' and done),
  done_s as (select item from qbank2.member_marks where user_id = p_user and kind = 'sos' and done),
  sem as (select generate_series(1, 8) s),
  per as (
    select s.s as semester,
      (select count(*) from qbank2.model_question_placement p where p.semester = s.s) model_total,
      (select count(*) from qbank2.model_question_placement p join done_q d on d.item = p.id where p.semester = s.s) model_done,
      (select count(*) from qbank2.qb_questions q where q.is_previous_university and q.semester_number = s.s and q.subject_code is not null) previous_total,
      (select count(*) from qbank2.qb_questions q join done_q d on d.item = q.id where q.is_previous_university and q.semester_number = s.s and q.subject_code is not null) previous_done,
      (select count(*) from qbank2.qb_most_important_questions m where m.is_active and m.semester = s.s) important_total,
      (select count(*) from qbank2.qb_most_important_questions m join done_q d on d.item = m.question_id where m.is_active and m.semester = s.s) important_done,
      (select count(*) from qbank2.hack_mnemonics x where x.semester = s.s) + (select count(*) from qbank2.hack_notes x where x.semester = s.s)
        + (select count(*) from qbank2.hack_sos_cards x where x.semester = s.s) hacks_total,
      (select count(*) from qbank2.hack_mnemonics x join done_m d on d.item = x.id where x.semester = s.s)
        + (select count(*) from qbank2.hack_notes x join done_n d on d.item = x.id where x.semester = s.s)
        + (select count(*) from qbank2.hack_sos_cards x join done_s d on d.item = x.id where x.semester = s.s) hacks_done,
      (select count(distinct q) from (
         select p.id q from qbank2.model_question_placement p where p.semester = s.s
         union select q.id from qbank2.qb_questions q where q.is_previous_university and q.semester_number = s.s and q.subject_code is not null
       ) u) questions_total,
      (select count(distinct q) from (
         select p.id q from qbank2.model_question_placement p join done_q d on d.item = p.id where p.semester = s.s
         union select q.id from qbank2.qb_questions q join done_q d on d.item = q.id where q.is_previous_university and q.semester_number = s.s and q.subject_code is not null
       ) u) questions_done
    from sem s
    where p_semester is null or s.s = p_semester
  )
  select jsonb_build_object(
    'semesters', coalesce((select jsonb_agg(to_jsonb(per) order by semester) from per), '[]'::jsonb),
    'model_subjects', case when p_semester is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('code', subject_code, 'total', total, 'done', done))
        from (select p.subject_code, count(*) total, count(d.item) done
                from qbank2.model_question_placement p left join done_q d on d.item = p.id
               where p.semester = p_semester group by 1) t), '[]'::jsonb) end,
    'previous_subjects', case when p_semester is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('code', subject_code, 'total', total, 'done', done))
        from (select q.subject_code, count(*) total, count(d.item) done
                from qbank2.qb_questions q left join done_q d on d.item = q.id
               where q.is_previous_university and q.semester_number = p_semester and q.subject_code is not null group by 1) t), '[]'::jsonb) end
  );
$$;

-- Saved or done items, newest first, with what a list needs to show them.
create or replace function public.qbank2_marked(p_user uuid, p_kind text, p_status text, p_semester integer, p_limit integer default 30, p_offset integer default 0)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with marks as (
    select k.item, k.updated_at from qbank2.member_marks k
     where k.user_id = p_user and k.kind = p_kind
       and case p_status when 'saved' then k.saved when 'done' then k.done else false end
       and (p_semester is null or (select semester from public.qbank2_item_semester(p_kind, k.item)) is not distinct from p_semester)
  ),
  page as (select * from marks order by updated_at desc, item limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0))
  select jsonb_build_object(
    'total', (select count(*) from marks),
    'rows', coalesce(case p_kind
      when 'q' then (select jsonb_agg(jsonb_build_object(
          'id', q.id, 'question', q.question, 'question_type', q.question_type, 'marks', q.marks,
          'answer', q.answer, 'answer_formatted', q.answer_formatted, 'rationale', q.rationale, 'exam_tip', q.exam_tip,
          'correct_option', q.correct_option, 'option_a', q.option_a, 'option_b', q.option_b, 'option_c', q.option_c, 'option_d', q.option_d,
          'official_subject_name', coalesce(q.official_subject_name, q.subject_name), 'official_unit_name', coalesce(q.official_unit_name, q.unit_name),
          'diagram_needed', q.diagram_needed, 'semester', coalesce(q.semester_number, q.official_semester_number)) order by p.updated_at desc, p.item)
        from page p join qbank2.qb_questions q on q.id = p.item)
      when 'mnemonic' then (select jsonb_agg(jsonb_build_object(
          'id', m.id, 'subject', m.subject, 'type', m.mnemonic_type, 'topic', m.topic, 'label', m.sentence_label,
          'sentence', m.sentence, 'meaning', m.meaning, 'style', m.style, 'semester', m.semester) order by p.updated_at desc, p.item)
        from page p join qbank2.hack_mnemonics m on m.id = p.item)
      when 'note' then (select jsonb_agg(n.data || jsonb_build_object('_id', n.id, 'semester', n.semester) order by p.updated_at desc, p.item)
        from page p join qbank2.hack_notes n on n.id = p.item)
      when 'sos' then (select jsonb_agg(c.data || jsonb_build_object('_id', c.id, '_semester', c.semester) order by p.updated_at desc, p.item)
        from page p join qbank2.hack_sos_cards c on c.id = p.item)
    end, '[]'::jsonb)
  );
$$;

create or replace function public.qbank2_resume_set(p_user uuid, p_semester integer, p_path text, p_label text)
returns void
language sql security invoker
set search_path = ''
as $$
  insert into qbank2.member_resume (user_id, semester, path, label)
  values (p_user, p_semester, p_path, p_label)
  on conflict (user_id, semester) do update set path = excluded.path, label = excluded.label, updated_at = now();
$$;

create or replace function public.qbank2_resume_get(p_user uuid)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('semester', semester, 'path', path, 'label', label, 'at', updated_at) order by updated_at desc), '[]'::jsonb)
    from qbank2.member_resume where user_id = p_user;
$$;

-- Server key only.
do $$
declare f text;
begin
  foreach f in array array[
    'qbank2.refresh_question_exam_years()',
    'qbank2.recent_years()',
    'qbank2.year_match(bigint, integer[], text)',
    'qbank2.get_previous_questions_page(integer, text[], text, integer, integer, integer[], text)',
    'qbank2.miq_search(integer, text, text, integer, boolean, text, integer, integer, text, text, integer[], text)',
    'public.qbank2_year_options(integer, text)',
    'public.qbank2_rpc(text, jsonb)',
    'public.qbank2_notes(integer, text, text, text, text, integer, integer)',
    'public.qbank2_sos(text, text, text, text, integer, integer)',
    'public.qbank2_item_semester(text, bigint)',
    'public.qbank2_mark_set(uuid, text, bigint, boolean, boolean)',
    'public.qbank2_marks_get(uuid, text, bigint[])',
    'public.qbank2_progress(uuid, integer)',
    'public.qbank2_marked(uuid, text, text, integer, integer, integer)',
    'public.qbank2_resume_set(uuid, integer, text, text)',
    'public.qbank2_resume_get(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

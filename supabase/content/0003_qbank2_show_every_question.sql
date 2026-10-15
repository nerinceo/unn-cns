-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
--
-- Question Bank Pro: every question is shown (Naveen, 2026-10-15: "no
-- questions will go draft or hide").
--
-- The functions copied from nerusalem.in hid 9,866 of the 26,664 questions:
--   * 7,100 model questions whose status is still 'Draft' (6,862 of them
--     already approved in review) or that review rejected;
--   *    24 previous-year questions, same filters;
--   * 2,741 questions with no official RGUHS subject mapping (electives,
--     BCLS/ACLS/STP modules, the semester 8 internship …), which the model
--     list could not place because it keyed on official_subject_code only;
--   *     1 question with neither flag.
--
-- New rule — no status, review or publish filter anywhere:
--   Previous Years   every is_previous_university question;
--   Model Questions  every model question, and every question that is not a
--                    previous-year one, placed by its official subject / unit
--                    when it has them (exactly as before) and otherwise by its
--                    own subject_code / unit_code and semester_number.
-- Together they cover all 26,664. Paging stays ORDER BY a unique key, so no
-- question can be skipped or repeated between pages.
--
-- The source functions are kept, renamed *_source, so the change is traceable
-- and reversible (rename them back). Schema qbank2 only.
-- ===========================================================================

do $$ begin
  if to_regprocedure('qbank2.model_question_filter_options_v1_source(integer, text)') is null then
    alter function qbank2.model_question_filter_options_v1(integer, text) rename to model_question_filter_options_v1_source;
  end if;
  if to_regprocedure('qbank2.model_questions_page_v1_source(integer, text, text, text, integer, boolean, text, integer, integer)') is null then
    alter function qbank2.model_questions_page_v1(integer, text, text, text, integer, boolean, text, integer, integer) rename to model_questions_page_v1_source;
  end if;
  if to_regprocedure('qbank2.get_previous_question_subjects_source(integer)') is null then
    alter function qbank2.get_previous_question_subjects(integer) rename to get_previous_question_subjects_source;
  end if;
  if to_regprocedure('qbank2.get_previous_questions_page_source(integer, text[], text, integer, integer)') is null then
    alter function qbank2.get_previous_questions_page(integer, text[], text, integer, integer) rename to get_previous_questions_page_source;
  end if;
end $$;

-- Where a question sits in the Model Questions list. Official mapping first
-- (the source's own placement, unchanged), the question's own columns otherwise.
create or replace view qbank2.model_question_placement as
select
  q.id,
  coalesce(nullif(q.official_subject_code, ''), q.subject_code) as subject_code,
  coalesce(nullif(q.official_subject_name, ''), nullif(q.subject_name, ''), q.official_subject_code, q.subject_code) as subject_name,
  coalesce(nullif(q.official_unit_code, ''), nullif(q.unit_code, '')) as unit_code,
  coalesce(nullif(q.official_unit_name, ''), nullif(q.unit_name, '')) as unit_name,
  case
    when q.official_subject_code ~ '^SEM[1-8]_' then substr(q.official_subject_code, 4, 1)::integer
    else coalesce(q.official_semester_number, q.semester_number)
  end as semester
from qbank2.qb_questions q
where q.is_model_question is true
   or q.is_previous_university is not true;

create or replace function qbank2.model_question_filter_options_v1(p_semester integer, p_subject text default null::text)
returns jsonb
language sql stable
set search_path to 'qbank2'
as $$
with eligible as materialized (
  select p.subject_code, p.subject_name, p.unit_code, p.unit_name,
         q.question_type, q.marks, q.diagram_needed
    from qbank2.model_question_placement p
    join qbank2.qb_questions q using (id)
   where p.semester = p_semester
     and (nullif(p_subject, '') is null or p.subject_code = p_subject)
)
select jsonb_build_object(
  'subjects', coalesce((
    select jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name) order by x.name, x.code)
      from (select subject_code as code, coalesce(min(nullif(subject_name, '')), subject_code) as name
              from eligible where subject_code is not null group by subject_code) x
  ), '[]'::jsonb),
  'units', coalesce((
    select jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name) order by x.code)
      from (select unit_code as code, coalesce(min(nullif(unit_name, '')), unit_code) as name
              from eligible where unit_code is not null and unit_code <> '' group by unit_code) x
  ), '[]'::jsonb),
  'types', coalesce((
    select jsonb_agg(x.question_type order by x.question_type)
      from (select distinct question_type from eligible where question_type is not null and question_type <> '') x
  ), '[]'::jsonb),
  'marks', coalesce((
    select jsonb_agg(x.marks order by x.marks)
      from (select distinct marks from eligible where marks is not null) x
  ), '[]'::jsonb),
  'has_drawing', coalesce((select bool_or(diagram_needed is true) from eligible), false)
);
$$;

create or replace function qbank2.model_questions_page_v1(
  p_semester integer, p_subject text, p_unit text default null::text, p_type text default null::text,
  p_marks integer default null::integer, p_drawing boolean default false, p_search text default null::text,
  p_limit integer default 30, p_offset integer default 0
)
returns table(question jsonb, total_count bigint)
language sql stable
set search_path to 'qbank2'
as $$
with matching as materialized (
  select p.id
    from qbank2.model_question_placement p
    join qbank2.qb_questions q using (id)
   where p.semester = p_semester
     and p.subject_code = p_subject
     and (nullif(p_unit, '') is null or p.unit_code = p_unit)
     and (nullif(p_type, '') is null or q.question_type = p_type)
     and (p_marks is null or q.marks = p_marks)
     and (p_drawing is not true or q.diagram_needed is true)
     and (
       nullif(btrim(p_search), '') is null
       or q.question ilike '%' || btrim(p_search) || '%'
       or coalesce(q.answer, '') ilike '%' || btrim(p_search) || '%'
       or coalesce(q.exam_tip, '') ilike '%' || btrim(p_search) || '%'
     )
),
page as (
  select id from matching
   order by id
   limit least(greatest(coalesce(p_limit, 30), 1), 30)
  offset greatest(coalesce(p_offset, 0), 0)
),
totals as (select count(*) as n from matching)
select
  jsonb_build_object(
    'id', q.id,
    -- Keys as the page reads them; values fall back to the question's own
    -- subject / unit where it has no official mapping.
    'official_subject_code', p.subject_code,
    'official_subject_name', p.subject_name,
    'official_unit_code', p.unit_code,
    'official_unit_name', p.unit_name,
    'question_type', q.question_type,
    'marks', q.marks,
    'question', q.question,
    'answer', q.answer,
    'answer_formatted', q.answer_formatted,
    'rationale', q.rationale,
    'exam_tip', q.exam_tip,
    'correct_option', q.correct_option,
    'option_a', q.option_a,
    'option_b', q.option_b,
    'option_c', q.option_c,
    'option_d', q.option_d,
    'diagram_needed', q.diagram_needed,
    'diagram_status', q.diagram_status,
    'diagram_image_url', q.diagram_image_url
  ) as question,
  totals.n as total_count
from page
join qbank2.qb_questions q using (id)
join qbank2.model_question_placement p using (id)
cross join totals
order by q.id;
$$;

create or replace function qbank2.get_previous_question_subjects(p_semester integer)
returns table(subject_code text, subject_name text, question_count bigint)
language sql stable security definer
set search_path to 'qbank2'
as $$
  select q.subject_code::text,
         coalesce(max(nullif(trim(q.official_subject_name), '')), q.subject_code)::text as subject_name,
         count(*)::bigint as question_count
    from qbank2.qb_questions q
   where q.semester_number = p_semester
     and q.is_previous_university = true
     and q.subject_code is not null
   group by q.subject_code
   order by subject_name;
$$;

create or replace function qbank2.get_previous_questions_page(
  p_semester integer, p_subject_codes text[], p_search text default ''::text,
  p_offset integer default 0, p_limit integer default 25
)
returns table(id bigint, subject_code text, question_type text, marks text, question text, answer text,
  answer_formatted text, option_a text, option_b text, option_c text, option_d text, correct_option text,
  rationale text, exam_tip text, times_asked bigint, years_asked text[], exam_sessions text[], total_count bigint)
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
)
select
  q.id::bigint, q.subject_code::text, q.question_type::text, q.marks::text, q.question::text,
  q.answer::text, q.answer_formatted::text, q.option_a::text, q.option_b::text, q.option_c::text,
  q.option_d::text, q.correct_option::text, q.rationale::text, q.exam_tip::text,
  coalesce(occ.times_asked, 0)::bigint as times_asked,
  coalesce(occ.years_asked, array[]::text[]) as years_asked,
  coalesce(occ.exam_sessions, array[]::text[]) as exam_sessions,
  count(*) over()::bigint as total_count
from filtered q
left join lateral (
  with unique_sessions as (
    select distinct nullif(trim(o.exam_year::text), '') as exam_year,
                    nullif(trim(o.exam_session::text), '') as exam_session
      from qbank2.qb_question_occurrences o
     where o.question_id = q.id
  )
  select count(*)::bigint as times_asked,
         array_agg(distinct exam_year order by exam_year) filter (where exam_year is not null) as years_asked,
         array_agg(distinct exam_session order by exam_session) filter (where exam_session is not null) as exam_sessions
    from unique_sessions
   where exam_year is not null or exam_session is not null
) occ on true
order by coalesce(occ.times_asked, 0) desc, q.id asc
offset greatest(p_offset, 0)
limit least(greatest(p_limit, 1), 100);
$$;

-- Same posture as the rest of qbank2: server key only.
revoke all on qbank2.model_question_placement from public, anon, authenticated;
grant select on qbank2.model_question_placement to service_role;
do $$
declare f text;
begin
  foreach f in array array[
    'qbank2.model_question_filter_options_v1(integer, text)',
    'qbank2.model_questions_page_v1(integer, text, text, text, integer, boolean, text, integer, integer)',
    'qbank2.get_previous_question_subjects(integer)',
    'qbank2.get_previous_questions_page(integer, text[], text, integer, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

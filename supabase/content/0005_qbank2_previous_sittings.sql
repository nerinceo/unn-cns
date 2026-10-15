-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
--
-- Previous Years: "Asked 9 times" sat next to 8 years (Naveen, 2026-10-15).
-- times_asked counted distinct exam sittings — Apr 2014 and Sep 2014 are two —
-- while the list showed distinct years, so 433 questions disagreed with
-- themselves. The page now lists the sittings, and the count is the number
-- of sittings listed, so the two can never differ.
--
-- A sitting is "Mon YYYY" (or "Mar/Apr YYYY") from the occurrence's session
-- text, which is free-form in the source ("Sep 2013", "APRIL-06",
-- "April - Paper II"); a session with no month falls back to its year. The
-- same sitting reached through two papers counts once.
--
-- Adds a `sittings` column, so the function is dropped and recreated (the
-- dispatcher qbank2_rpc calls it by name). The source's version stays as
-- get_previous_questions_page_source.
-- ===========================================================================

create or replace function qbank2.exam_sitting(p_year text, p_session text)
returns table (label text, sort_key integer)
language sql immutable
set search_path = ''
as $$
  with parts as (
    select
      coalesce(
        nullif(substring(coalesce(p_year, '') from '(19\d{2}|20\d{2})'), ''),
        nullif(substring(coalesce(p_session, '') from '(19\d{2}|20\d{2})'), '')
      ) as yr,
      (select string_agg(initcap(m[1]), '/' order by ord)
         from regexp_matches(lower(coalesce(p_session, '')), '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*', 'g')
              with ordinality as t(m, ord)) as months,
      (select min(array_position(array['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'], m[1]))
         from regexp_matches(lower(coalesce(p_session, '')), '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*', 'g') as t(m)) as first_month
  )
  select case when months is null then yr else months || ' ' || yr end,
         yr::integer * 100 + coalesce(first_month, 0)
    from parts
   where yr is not null;
$$;

drop function if exists qbank2.get_previous_questions_page(integer, text[], text, integer, integer);
create function qbank2.get_previous_questions_page(
  p_semester integer, p_subject_codes text[], p_search text default ''::text,
  p_offset integer default 0, p_limit integer default 25
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

revoke all on function qbank2.exam_sitting(text, text) from public, anon, authenticated;
grant execute on function qbank2.exam_sitting(text, text) to service_role;
revoke all on function qbank2.get_previous_questions_page(integer, text[], text, integer, integer) from public, anon, authenticated;
grant execute on function qbank2.get_previous_questions_page(integer, text[], text, integer, integer) to service_role;

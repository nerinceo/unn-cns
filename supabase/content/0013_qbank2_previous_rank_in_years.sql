-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
--
-- Previous Years under a scheme / year filter (Naveen, 2026-10-15): order by
-- how often a question was asked IN the chosen years, matching the Asked
-- panel, which then shows only those sittings. Without a year filter the
-- order is as 0012 (all-time times asked).
-- ===========================================================================

create or replace function qbank2.get_previous_questions_page(
  p_semester integer, p_subject_codes text[], p_search text default ''::text,
  p_offset integer default 0, p_limit integer default 25,
  p_years integer[] default null, p_pattern text default null,
  p_user uuid default null, p_read text default null
)
returns table(id bigint, subject_code text, question_type text, marks text, question text, answer text,
  answer_formatted text, option_a text, option_b text, option_c text, option_d text, correct_option text,
  rationale text, exam_tip text, times_asked bigint, years_asked text[], exam_sessions text[], sittings text[],
  total_count bigint)
language sql stable security definer
set search_path to 'qbank2'
as $$
with filtered as (
  select q.id,
         coalesce(s.times_asked, 0) as times_asked,
         -- "Most asked" within the chosen years: sittings are "Mon YYYY" / "YYYY".
         case when coalesce(cardinality(p_years), 0) = 0 then coalesce(s.times_asked, 0)
              else (select count(*) from unnest(s.sittings) l
                     where right(l, 4) ~ '^[0-9]{4}$' and right(l, 4)::integer = any(p_years))
         end as rank_asked
    from qbank2.qb_questions q
    left join qbank2.question_sittings s on s.question_id = q.id
   where q.semester_number = p_semester
     and q.subject_code = any(p_subject_codes)
     and q.is_previous_university = true
     and (coalesce(trim(p_search), '') = '' or q.question ilike '%' || trim(p_search) || '%')
     and (coalesce(cardinality(p_years), 0) = 0 and nullif(p_pattern, '') is null or qbank2.year_match(q.id, p_years, p_pattern))
     and (p_user is null or p_read is null or p_read not in ('read', 'unread')
          or exists (select 1 from qbank2.member_marks k
                      where k.user_id = p_user and k.kind = 'q' and k.item = q.id and k.done) = (p_read = 'read'))
),
page as (
  select f.id, f.times_asked, f.rank_asked, count(*) over()::bigint as total_count
    from filtered f
   order by f.rank_asked desc, f.times_asked desc, f.id asc
  offset greatest(p_offset, 0)
   limit least(greatest(p_limit, 1), 100)
)
select
  q.id::bigint, q.subject_code::text, q.question_type::text, q.marks::text, q.question::text,
  q.answer::text, q.answer_formatted::text, q.option_a::text, q.option_b::text, q.option_c::text,
  q.option_d::text, q.correct_option::text, q.rationale::text, q.exam_tip::text,
  p.times_asked::bigint,
  coalesce(s.years_asked, array[]::text[]),
  coalesce(s.exam_sessions, array[]::text[]),
  coalesce(s.sittings, array[]::text[]),
  p.total_count
from page p
join qbank2.qb_questions q on q.id = p.id
left join qbank2.question_sittings s on s.question_id = p.id
order by p.rank_asked desc, p.times_asked desc, p.id asc;
$$;

revoke all on function qbank2.get_previous_questions_page(integer, text[], text, integer, integer, integer[], text, uuid, text) from public, anon, authenticated;
grant execute on function qbank2.get_previous_questions_page(integer, text[], text, integer, integer, integer[], text, uuid, text) to service_role;

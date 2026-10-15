-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
--
-- Previous Years, made fast (pre-launch audit 2026-10-15): the page worked out
-- every question's sittings with qbank2.exam_sitting() for the WHOLE semester
-- (~6,000 calls, ~0.6 s) before sorting and taking 25. Sittings are static, so
-- they are kept precomputed beside question_year_stats and rebuilt by the same
-- qbank2.refresh_question_exam_years() (re-run after an import). Same output,
-- row for row.
-- ===========================================================================

create table if not exists qbank2.question_sittings (
  question_id bigint primary key,
  times_asked integer not null,
  sittings text[] not null,
  years_asked text[] not null,
  exam_sessions text[] not null
);
alter table qbank2.question_sittings enable row level security;
revoke all on qbank2.question_sittings from public, anon, authenticated;
grant all on qbank2.question_sittings to service_role;

create index if not exists qb_questions_previous_sem_subject
  on qbank2.qb_questions (semester_number, subject_code) where is_previous_university is true;

create or replace function qbank2.refresh_question_sittings()
returns integer
language plpgsql
set search_path = ''
as $$
declare n integer;
begin
  delete from qbank2.question_sittings;
  insert into qbank2.question_sittings (question_id, times_asked, sittings, years_asked, exam_sessions)
  select ids.question_id,
         coalesce(s.times_asked, 0),
         coalesce(s.sittings, array[]::text[]),
         coalesce(y.years_asked, array[]::text[]),
         coalesce(e.exam_sessions, array[]::text[])
    from (select distinct question_id from qbank2.qb_question_occurrences where question_id is not null) ids
    left join lateral (
      select count(*)::integer times_asked, array_agg(label order by sort_key, label) sittings
        from (select distinct x.label, x.sort_key
                from qbank2.qb_question_occurrences o
                cross join lateral qbank2.exam_sitting(o.exam_year::text, o.exam_session::text) x
               where o.question_id = ids.question_id) d
    ) s on true
    left join lateral (
      select array_agg(distinct nullif(trim(o.exam_year::text), '') order by nullif(trim(o.exam_year::text), '')) years_asked
        from qbank2.qb_question_occurrences o
       where o.question_id = ids.question_id and nullif(trim(o.exam_year::text), '') is not null
    ) y on true
    left join lateral (
      select array_agg(distinct nullif(trim(o.exam_session::text), '') order by nullif(trim(o.exam_session::text), '')) exam_sessions
        from qbank2.qb_question_occurrences o
       where o.question_id = ids.question_id and nullif(trim(o.exam_session::text), '') is not null
    ) e on true;
  get diagnostics n = row_count;
  return n;
end;
$$;
select qbank2.refresh_question_sittings();

-- One refresh for everything derived from the occurrences (as 0007, plus sittings).
create or replace function qbank2.refresh_question_exam_years()
returns integer
language plpgsql
set search_path = ''
as $$
declare n integer; w integer[];
begin
  delete from qbank2.question_exam_years;
  insert into qbank2.question_exam_years (question_id, year)
  select distinct o.question_id, substring(x.label from '(\d{4})$')::integer
    from qbank2.qb_question_occurrences o
    cross join lateral qbank2.exam_sitting(o.exam_year::text, o.exam_session::text) x
   where o.question_id is not null;
  get diagnostics n = row_count;

  select qbank2.recent_years() into w;
  delete from qbank2.question_year_stats;
  insert into qbank2.question_year_stats (question_id, years, in_window, n_years)
  select question_id, array_agg(year order by year),
         count(*) filter (where year = any(w)), count(*)
    from qbank2.question_exam_years group by question_id;

  perform qbank2.refresh_question_sittings();
  return n;
end;
$$;

-- Same signature, columns and order as 0006; reads the precomputed sittings.
create or replace function qbank2.get_previous_questions_page(
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
  select q.id, coalesce(s.times_asked, 0) as times_asked
    from qbank2.qb_questions q
    left join qbank2.question_sittings s on s.question_id = q.id
   where q.semester_number = p_semester
     and q.subject_code = any(p_subject_codes)
     and q.is_previous_university = true
     and (coalesce(trim(p_search), '') = '' or q.question ilike '%' || trim(p_search) || '%')
     and (coalesce(cardinality(p_years), 0) = 0 and nullif(p_pattern, '') is null or qbank2.year_match(q.id, p_years, p_pattern))
),
page as (
  select f.id, f.times_asked, count(*) over()::bigint as total_count
    from filtered f
   order by f.times_asked desc, f.id asc
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
order by p.times_asked desc, p.id asc;
$$;

revoke all on function qbank2.refresh_question_sittings() from public, anon, authenticated;
revoke all on function qbank2.refresh_question_exam_years() from public, anon, authenticated;
revoke all on function qbank2.get_previous_questions_page(integer, text[], text, integer, integer, integer[], text) from public, anon, authenticated;
grant execute on function qbank2.get_previous_questions_page(integer, text[], text, integer, integer, integer[], text) to service_role;

-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
--
-- Year filters, made fast: 0006 worked a question's exam years out per row
-- (34 s for one semester's options). Years are static, so each question's are
-- kept precomputed: the years, how many fall in the last-4-years window, and
-- how many different years in all. Rebuilt with the exam years by
-- qbank2.refresh_question_exam_years() (re-run after an import).
-- ===========================================================================

create table if not exists qbank2.question_year_stats (
  question_id bigint primary key,
  years integer[] not null,
  in_window integer not null,
  n_years integer not null
);
create index if not exists question_year_stats_years on qbank2.question_year_stats using gin (years);
alter table qbank2.question_year_stats enable row level security;
revoke all on qbank2.question_year_stats from public, anon, authenticated;
grant all on qbank2.question_year_stats to service_role;

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
  return n;
end;
$$;
select qbank2.refresh_question_exam_years();

-- Same contract as 0006, now one indexed lookup.
create or replace function qbank2.year_match(p_question bigint, p_years integer[], p_pattern text)
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((
    select (coalesce(cardinality(p_years), 0) = 0 or s.years && p_years)
       and case nullif(p_pattern, '')
             when 'all4' then s.in_window >= 4
             when 'three4' then s.in_window >= 3
             when 'two4' then s.in_window >= 2
             when 'any4' then s.in_window >= 1
             when 'often' then s.n_years >= 5
             else true
           end
      from qbank2.question_year_stats s where s.question_id = p_question
  ), coalesce(cardinality(p_years), 0) = 0 and nullif(p_pattern, '') is null);
$$;

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
  st as (select s.* from qbank2.question_year_stats s join qs on qs.id = s.question_id)
  select jsonb_build_object(
    'window', to_jsonb(qbank2.recent_years()),
    'years', coalesce((
      select jsonb_agg(jsonb_build_object('year', y, 'count', n) order by y desc)
        from (select y, count(*) n from st, unnest(st.years) y group by y) t
    ), '[]'::jsonb),
    'patterns', (select jsonb_build_object(
      'all4', count(*) filter (where in_window >= 4),
      'three4', count(*) filter (where in_window >= 3),
      'two4', count(*) filter (where in_window >= 2),
      'any4', count(*) filter (where in_window >= 1),
      'often', count(*) filter (where n_years >= 5)
    ) from st)
  );
$$;

revoke all on function qbank2.refresh_question_exam_years() from public, anon, authenticated;
revoke all on function qbank2.year_match(bigint, integer[], text) from public, anon, authenticated;
revoke all on function public.qbank2_year_options(integer, text) from public, anon, authenticated;
grant execute on function qbank2.year_match(bigint, integer[], text) to service_role;
grant execute on function public.qbank2_year_options(integer, text) to service_role;

-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
--
-- Scheme filter on Previous Years and Most Important (Naveen, 2026-10-15):
-- "after 2022 new scheme, before 2022 old scheme". By exam year, because the
-- source's own `scheme` text is free-form ("RS-2/RS-3/RS-4/RS-5",
-- "Historical …", blank for 1,023 questions) and cannot be filtered on. A
-- question set in both eras is in both. The filter itself is applied in CNS
-- as a year range; this only adds the two counts to the year options.
-- ===========================================================================

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
    ) from st),
    'schemes', (select jsonb_build_object(
      'new', count(*) filter (where years[cardinality(years)] >= 2022),
      'old', count(*) filter (where years[1] < 2022)
    ) from st)
  );
$$;

revoke all on function public.qbank2_year_options(integer, text) from public, anon, authenticated;
grant execute on function public.qbank2_year_options(integer, text) to service_role;

-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
--
-- Previous Years (Naveen, 2026-10-15):
--  * Read / unread: members mark a question read (member_marks.done, which
--    progress used before). The Previous Years list can show only read or
--    only unread questions for the member (p_user, p_read — set by CNS from
--    the session, never by the browser: semester reads are not on the API).
--  * qbank2_read_state: read count for one subject, for its progress bar.
--  * qbank2_year_facets: filter counts for the CURRENT subject and scheme
--    (0008's options were semester-wide); the years list keeps to the
--    scheme's era; repeat counts respect the chosen years / scheme.
-- ===========================================================================

drop function if exists qbank2.get_previous_questions_page(integer, text[], text, integer, integer, integer[], text);
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
  select q.id, coalesce(s.times_asked, 0) as times_asked
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

create or replace function public.qbank2_read_state(p_user uuid, p_semester integer, p_subject_codes text[])
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object('total', count(*), 'read', count(k.item))
    from qbank2.qb_questions q
    left join qbank2.member_marks k on k.user_id = p_user and k.kind = 'q' and k.item = q.id and k.done
   where q.semester_number = p_semester and q.is_previous_university is true and q.subject_code = any(p_subject_codes);
$$;

create or replace function public.qbank2_year_facets(
  p_semester integer, p_section text, p_subject_codes text[] default null, p_subject text default null,
  p_scheme text default null, p_years integer[] default null
)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with qs as (
    select q.id from qbank2.qb_questions q
     where p_section = 'previous' and q.is_previous_university is true and q.semester_number = p_semester
       and (p_subject_codes is null or q.subject_code = any(p_subject_codes))
    union
    select m.question_id from qbank2.qb_most_important_questions m
      join qbank2.qb_questions q on q.id = m.question_id
     where p_section = 'important' and m.is_active is true and m.semester = p_semester
       and (nullif(p_subject, '') is null or q.official_subject_code = p_subject)
  ),
  st as (select s.* from qbank2.question_year_stats s join qs on qs.id = s.question_id),
  era as (
    select distinct y from st, unnest(st.years) y
     where p_scheme is null or (p_scheme = 'new' and y >= 2022) or (p_scheme = 'old' and y < 2022)
  ),
  eff as (
    select case
      when coalesce(cardinality(p_years), 0) > 0 then coalesce((select array_agg(y) from era where y = any(p_years)), array[1000])
      when p_scheme in ('new', 'old') then coalesce((select array_agg(y) from era), array[1000])
    end as ys
  )
  select jsonb_build_object(
    'window', to_jsonb(qbank2.recent_years()),
    'years', coalesce((
      select jsonb_agg(jsonb_build_object('year', y, 'count', n) order by y desc)
        from (select y, count(*) n from st, unnest(st.years) y where y in (select y from era) group by y) t
    ), '[]'::jsonb),
    'patterns', (select jsonb_build_object(
      'all4', count(*) filter (where in_window >= 4),
      'three4', count(*) filter (where in_window >= 3),
      'two4', count(*) filter (where in_window >= 2),
      'any4', count(*) filter (where in_window >= 1),
      'often', count(*) filter (where n_years >= 5)
    ) from st, eff where eff.ys is null or st.years && eff.ys),
    'schemes', (select jsonb_build_object(
      'new', count(*) filter (where years[cardinality(years)] >= 2022),
      'old', count(*) filter (where years[1] < 2022)
    ) from st)
  );
$$;

-- Dispatcher as 0006, passing p_user / p_read to Previous Years.
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
        yrs, a->>'p_pattern',
        nullif(a->>'p_user', '')::uuid, nullif(a->>'p_read', '')
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

revoke all on function qbank2.get_previous_questions_page(integer, text[], text, integer, integer, integer[], text, uuid, text) from public, anon, authenticated;
grant execute on function qbank2.get_previous_questions_page(integer, text[], text, integer, integer, integer[], text, uuid, text) to service_role;
revoke all on function public.qbank2_rpc(text, jsonb) from public, anon, authenticated;
grant execute on function public.qbank2_rpc(text, jsonb) to service_role;
revoke all on function public.qbank2_read_state(uuid, integer, text[]) from public, anon, authenticated;
grant execute on function public.qbank2_read_state(uuid, integer, text[]) to service_role;
revoke all on function public.qbank2_year_facets(integer, text, text[], text, text, integer[]) from public, anon, authenticated;
grant execute on function public.qbank2_year_facets(integer, text, text[], text, text, integer[]) to service_role;

-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
--
-- Question Bank Pro shows exactly what thinkqi.com shows (Naveen, 2026-10-16:
-- "exact same questions answers and format, only UI we keep"). Supersedes
-- 0003's "no questions will go draft or hide".
--
-- thinkqi.com (the source project, pfbqgmicdmthhqorlwib) serves 24,769 of the
-- 26,664 questions; the 1,895 its review rejected are hidden. Measured by
-- replaying every call its pages make with its own anon key (RLS included),
-- D:\2026\_backups\qbank2-import\r1016\oracle.mjs. Per section:
--
--   Previous Years   is_previous_university, is_published, review 'Published'
--                    (its function is SECURITY DEFINER, so no RLS) — 14,130
--   Most Important   active selection, and the question's status, review and
--                    is_published all 'Published'                     — 7,000
--   Model / browse   status, review and is_published all 'Published' (the
--                    source's RLS policy, which its invoker-rights model page
--                    and its questions.html table reads run under)    — 15,829
--
-- Placement is unchanged (0003): a model-side question sits under its official
-- subject / unit when it has one, else its own subject / semester — which is
-- exactly how thinkqi.com's questions.html lists the electives, ACLS and
-- semester 8 internship questions that its Model page does not.
--
-- Every reader below keeps its 0003-0013 shape and gains only the section's
-- visibility predicate, so counts, lists, filters, year facets and Saved agree.
-- Signatures are unchanged: CNS needs no deploy for this file.
-- ===========================================================================

-- Model side -----------------------------------------------------------------
-- Every model reader (page, filter options, overview count, item semesters)
-- goes through this view.
create or replace view qbank2.model_question_placement as
 select id,
    coalesce(nullif(official_subject_code, ''::text), subject_code) as subject_code,
    coalesce(nullif(official_subject_name, ''::text), nullif(subject_name, ''::text), official_subject_code, subject_code) as subject_name,
    coalesce(nullif(official_unit_code, ''::text), nullif(unit_code, ''::text)) as unit_code,
    coalesce(nullif(official_unit_name, ''::text), nullif(unit_name, ''::text)) as unit_name,
        case
            when official_subject_code ~ '^SEM[1-8]_'::text then substr(official_subject_code, 4, 1)::integer
            else coalesce(official_semester_number, semester_number)
        end as semester
   from qbank2.qb_questions q
  where (is_model_question is true or is_previous_university is not true)
    and status = 'Published' and review_status = 'Published' and is_published is true;
revoke all on qbank2.model_question_placement from public, anon, authenticated;

-- Previous Years ---------------------------------------------------------------
create or replace function qbank2.get_previous_question_subjects(p_semester integer)
 returns table(subject_code text, subject_name text, question_count bigint)
 language sql
 stable security definer
 set search_path to 'qbank2'
as $function$
  select q.subject_code::text,
         coalesce(max(nullif(trim(q.official_subject_name), '')), q.subject_code)::text as subject_name,
         count(*)::bigint as question_count
    from qbank2.qb_questions q
   where q.semester_number = p_semester
     and q.is_previous_university = true
     and q.is_published = true and q.review_status = 'Published'
     and q.subject_code is not null
   group by q.subject_code
   order by subject_name;
$function$;

create or replace function qbank2.get_previous_questions_page(p_semester integer, p_subject_codes text[], p_search text default ''::text, p_offset integer default 0, p_limit integer default 25, p_years integer[] default null::integer[], p_pattern text default null::text, p_user uuid default null::uuid, p_read text default null::text)
 returns table(id bigint, subject_code text, question_type text, marks text, question text, answer text, answer_formatted text, option_a text, option_b text, option_c text, option_d text, correct_option text, rationale text, exam_tip text, times_asked bigint, years_asked text[], exam_sessions text[], sittings text[], total_count bigint)
 language sql
 stable security definer
 set search_path to 'qbank2'
as $function$
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
     and q.is_published = true and q.review_status = 'Published'
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
$function$;

create or replace function public.qbank2_read_state(p_user uuid, p_semester integer, p_subject_codes text[])
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select jsonb_build_object('total', count(*), 'read', count(k.item))
    from qbank2.qb_questions q
    left join qbank2.member_marks k on k.user_id = p_user and k.kind = 'q' and k.item = q.id and k.done
   where q.semester_number = p_semester and q.is_previous_university is true and q.subject_code = any(p_subject_codes)
     and q.is_published is true and q.review_status = 'Published';
$function$;

-- Most Important ---------------------------------------------------------------
create or replace function qbank2.miq_search(p_semester integer, p_subject text default null::text, p_type text default null::text, p_marks integer default null::integer, p_drawing boolean default false, p_search text default null::text, p_limit integer default 30, p_offset integer default 0, p_priority text default null::text, p_source text default null::text, p_years integer[] default null::integer[], p_pattern text default null::text)
 returns table(question jsonb, total_count bigint)
 language sql
 stable
 set search_path to 'qbank2'
as $function$
  with matching as materialized (
    select m.id as selection_id, m.question_id, m.importance_rank
      from qbank2.qb_most_important_questions m
      join qbank2.qb_questions q on q.id = m.question_id
     where m.semester = p_semester
       and m.is_active is true
       and q.status = 'Published' and q.review_status = 'Published' and q.is_published is true
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
      'correct_option', q.correct_option, 'rationale', q.rationale, 'exam_tip', q.exam_tip,
      'diagram_image_url', q.diagram_image_url
    ) as question,
    (select count(*) from matching) as total_count
  from paged p
  join qbank2.qb_most_important_questions m on m.id = p.selection_id
  join qbank2.qb_questions q on q.id = p.question_id
  order by p.importance_rank asc nulls last, p.selection_id asc;
$function$;

-- Counts, Saved and year filters: same predicates as the lists above ----------
create or replace function public.qbank2_overview()
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with s as (select generate_series(1, 8) as semester)
  select jsonb_agg(jsonb_build_object(
    'semester', s.semester,
    'model', (select count(*) from qbank2.model_question_placement p where p.semester = s.semester),
    'previous', (select count(*) from qbank2.qb_questions q where q.is_previous_university is true and q.semester_number = s.semester and q.subject_code is not null
                   and q.is_published is true and q.review_status = 'Published'),
    'important', (select count(*) from qbank2.qb_most_important_questions m join qbank2.qb_questions q on q.id = m.question_id
                   where m.is_active is true and m.semester = s.semester
                     and q.status = 'Published' and q.review_status = 'Published' and q.is_published is true),
    'written', (select count(*) from qbank2.qb_mock_exams e where e.semester = s.semester),
    'viva', (select count(*) from qbank2.qb_viva_exams v where v.semester = s.semester),
    'mnemonics', (select count(*) from qbank2.hack_mnemonics x where x.semester = s.semester),
    'notes', (select count(*) from qbank2.hack_notes x where x.semester = s.semester),
    'sos', (select count(*) from qbank2.hack_sos_cards x where x.semester = s.semester),
    'taplet_papers', (select count(*) from qbank2.taplet_papers t where t.semester = s.semester),
    'taplets', (select count(*) from qbank2.taplet_tasks t where t.semester = s.semester)
  ) order by s.semester)
  from s;
$function$;

create or replace function public.qbank2_item_semesters(p_kind text, p_item bigint)
 returns integer[]
 language sql
 stable
 set search_path to ''
as $function$
  select case p_kind
    when 'q' then (
      select array_agg(distinct s order by s) from (
        select p.semester s from qbank2.model_question_placement p where p.id = p_item
        union all
        select q.semester_number from qbank2.qb_questions q
         where q.id = p_item and q.is_previous_university is true and q.subject_code is not null
           and q.is_published is true and q.review_status = 'Published'
        union all
        select m.semester from qbank2.qb_most_important_questions m
          join qbank2.qb_questions q on q.id = m.question_id
         where m.question_id = p_item and m.is_active is true
           and q.status = 'Published' and q.review_status = 'Published' and q.is_published is true
      ) x where s between 1 and 8)
    when 'mnemonic' then (select array[m.semester] from qbank2.hack_mnemonics m where m.id = p_item)
    when 'note' then (select array[n.semester] from qbank2.hack_notes n where n.id = p_item)
    when 'sos' then (select array[coalesce(c.semester, 0)] from qbank2.hack_sos_cards c where c.id = p_item)
  end;
$function$;

create or replace function public.qbank2_year_options(p_semester integer, p_section text)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with qs as (
    select q.id from qbank2.qb_questions q
     where p_section = 'previous' and q.is_previous_university is true and q.semester_number = p_semester
       and q.is_published is true and q.review_status = 'Published'
    union
    select m.question_id from qbank2.qb_most_important_questions m
      join qbank2.qb_questions q on q.id = m.question_id
     where p_section = 'important' and m.is_active is true and m.semester = p_semester
       and q.status = 'Published' and q.review_status = 'Published' and q.is_published is true
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
$function$;

create or replace function public.qbank2_year_facets(p_semester integer, p_section text, p_subject_codes text[] default null::text[], p_subject text default null::text, p_scheme text default null::text, p_years integer[] default null::integer[])
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with qs as (
    select q.id from qbank2.qb_questions q
     where p_section = 'previous' and q.is_previous_university is true and q.semester_number = p_semester
       and q.is_published is true and q.review_status = 'Published'
       and (p_subject_codes is null or q.subject_code = any(p_subject_codes))
    union
    select m.question_id from qbank2.qb_most_important_questions m
      join qbank2.qb_questions q on q.id = m.question_id
     where p_section = 'important' and m.is_active is true and m.semester = p_semester
       and q.status = 'Published' and q.review_status = 'Published' and q.is_published is true
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
$function$;

-- Server key only (this project's default privileges grant EXECUTE to anon).
revoke all on function qbank2.get_previous_question_subjects(integer) from public, anon, authenticated;
revoke all on function qbank2.get_previous_questions_page(integer, text[], text, integer, integer, integer[], text, uuid, text) from public, anon, authenticated;
revoke all on function qbank2.miq_search(integer, text, text, integer, boolean, text, integer, integer, text, text, integer[], text) from public, anon, authenticated;
revoke all on function public.qbank2_read_state(uuid, integer, text[]) from public, anon, authenticated;
revoke all on function public.qbank2_overview() from public, anon, authenticated;
revoke all on function public.qbank2_item_semesters(text, bigint) from public, anon, authenticated;
revoke all on function public.qbank2_year_options(integer, text) from public, anon, authenticated;
revoke all on function public.qbank2_year_facets(integer, text, text[], text, text, integer[]) from public, anon, authenticated;
grant execute on function qbank2.get_previous_question_subjects(integer) to service_role;
grant execute on function qbank2.get_previous_questions_page(integer, text[], text, integer, integer, integer[], text, uuid, text) to service_role;
grant execute on function qbank2.miq_search(integer, text, text, integer, boolean, text, integer, integer, text, text, integer[], text) to service_role;
grant execute on function public.qbank2_read_state(uuid, integer, text[]) to service_role;
grant execute on function public.qbank2_overview() to service_role;
grant execute on function public.qbank2_item_semesters(text, bigint) to service_role;
grant execute on function public.qbank2_year_options(integer, text) to service_role;
grant execute on function public.qbank2_year_facets(integer, text, text[], text, text, integer[]) to service_role;
grant select on qbank2.model_question_placement to service_role;

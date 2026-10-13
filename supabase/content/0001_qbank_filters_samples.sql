-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
--
-- Question bank, 2026-10-13 (Naveen):
--   * Multi-select filters: several subjects, types, marks and topics at once.
--   * 10 free sample questions per semester for students who haven't bought it.
--
-- Adds three functions; changes nothing that exists, so the live site keeps
-- working before and after this runs.
--   qbank_browse  qbank_questions with arrays instead of single values
--   qbank_marks   marks with counts across a set of subjects (the marks filter)
--   qbank_sample  the fixed 10 samples for a semester, mixed across types
--
-- Server key only. The explicit REVOKEs are load-bearing: this project's
-- default privileges grant EXECUTE on new functions to anon.
-- ===========================================================================

-- 1. Browse with any number of values per filter. NULL or empty = no filter.
--    'Other' in p_types matches questions with no type (qbank_types reports
--    them as 'Other'). p_topics are "<subject_id>|<topic_code>" keys, the
--    form the app already uses for topic ids.
create or replace function public.qbank_browse(
  p_subject_ids text[],
  p_types text[] default null,
  p_marks integer[] default null,
  p_topics text[] default null,
  p_search text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  id bigint, subject_id text, subject_name text, semester integer,
  unit_code text, unit_name text, topic_code text, topic_name text,
  source_question_type text, marks integer,
  stem text, model_answer text, rationale text, exam_tip text, diagram_note text,
  diagram_image_url text, option_a text, option_b text, option_c text, option_d text,
  correct_option text, status text, total_count bigint
)
language sql stable security invoker
set search_path = ''
as $$
  with pattern as (
    select case
      when nullif(btrim(p_search), '') is null then null
      else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    end as p
  ),
  matched as (
    select q.*
    from qbank.bank_questions q, pattern
    where q.subject_id = any (coalesce(p_subject_ids, '{}'))
      and (coalesce(cardinality(p_types), 0) = 0 or coalesce(q.source_question_type, 'Other') = any (p_types))
      and (coalesce(cardinality(p_marks), 0) = 0 or q.marks = any (p_marks))
      and (coalesce(cardinality(p_topics), 0) = 0 or (q.subject_id || '|' || q.topic_code) = any (p_topics))
      and (pattern.p is null or q.stem ilike pattern.p or q.model_answer ilike pattern.p)
  )
  select m.id, m.subject_id, m.subject_name, m.semester_number,
         m.unit_code, m.unit_name, m.topic_code, m.topic_name,
         m.source_question_type, m.marks, m.stem, m.model_answer, m.rationale, m.exam_tip,
         m.diagram_note, m.diagram_image_url, m.option_a, m.option_b, m.option_c, m.option_d,
         m.correct_option, m.status, count(*) over () as total_count
  from matched m
  order by md5(m.id::text), m.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

-- 2. Marks with counts, for the marks filter. Questions without marks are left out.
create or replace function public.qbank_marks(p_subject_ids text[])
returns table (marks integer, count bigint)
language sql stable security invoker
set search_path = ''
as $$
  select q.marks, count(*)
  from qbank.bank_questions q
  where q.subject_id = any (coalesce(p_subject_ids, '{}'))
    and q.marks is not null
  group by q.marks
  order by q.marks;
$$;

-- 3. The free samples: p_n questions across the given subjects (one semester),
--    taking turns across question types so an MCQ-heavy semester still shows
--    essays and viva. Fixed, not random per visit: the order is a hash of the
--    question id, so everyone sees the same questions and refreshing can't
--    reveal more of the bank. Changing 'sample-v1' picks a new set.
create or replace function public.qbank_sample(p_subject_ids text[], p_n integer default 10)
returns table (
  id bigint, subject_id text, subject_name text, semester integer,
  unit_code text, unit_name text, topic_code text, topic_name text,
  source_question_type text, marks integer,
  stem text, model_answer text, rationale text, exam_tip text, diagram_note text,
  diagram_image_url text, option_a text, option_b text, option_c text, option_d text,
  correct_option text, status text, total_count bigint
)
language sql stable security invoker
set search_path = ''
as $$
  with ranked as (
    select q.*,
           row_number() over (
             partition by coalesce(q.source_question_type, 'Other')
             order by md5('sample-v1:' || q.id::text)
           ) as turn
    from qbank.bank_questions q
    where q.subject_id = any (coalesce(p_subject_ids, '{}'))
  )
  select r.id, r.subject_id, r.subject_name, r.semester_number,
         r.unit_code, r.unit_name, r.topic_code, r.topic_name,
         r.source_question_type, r.marks, r.stem, r.model_answer, r.rationale, r.exam_tip,
         r.diagram_note, r.diagram_image_url, r.option_a, r.option_b, r.option_c, r.option_d,
         r.correct_option, r.status, least(greatest(coalesce(p_n, 10), 1), 25)::bigint as total_count
  from ranked r
  order by r.turn, md5('sample-v1:' || coalesce(r.source_question_type, 'Other')), r.id
  limit least(greatest(coalesce(p_n, 10), 1), 25);
$$;

revoke all on function public.qbank_browse(text[], text[], integer[], text[], text, integer, integer) from public, anon, authenticated;
revoke all on function public.qbank_marks(text[])                                                   from public, anon, authenticated;
revoke all on function public.qbank_sample(text[], integer)                                         from public, anon, authenticated;
grant execute on function public.qbank_browse(text[], text[], integer[], text[], text, integer, integer) to service_role;
grant execute on function public.qbank_marks(text[])                                                   to service_role;
grant execute on function public.qbank_sample(text[], integer)                                         to service_role;

notify pgrst, 'reload schema';

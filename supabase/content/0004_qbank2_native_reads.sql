-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
--
-- Question Bank Pro as native CNS pages (Naveen, 2026-10-15): reads for the
-- parts of the bank that nerusalem.in kept inside its HTML (Exam Hacks,
-- Practice Taplets) plus the per-semester counts the semester picker and the
-- section dashboard show. Each returns one jsonb document; lists come with
-- their total and the filter options, in the source's own order (ord).
--
-- Adds functions only. Server key only (the REVOKEs are load-bearing: this
-- project's default privileges grant EXECUTE on new functions to anon).
-- ===========================================================================

-- What each semester holds, section by section.
create or replace function public.qbank2_overview()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with s as (select generate_series(1, 8) as semester)
  select jsonb_agg(jsonb_build_object(
    'semester', s.semester,
    'model', (select count(*) from qbank2.model_question_placement p where p.semester = s.semester),
    'previous', (select count(*) from qbank2.qb_questions q where q.is_previous_university is true and q.semester_number = s.semester and q.subject_code is not null),
    'important', (select count(*) from qbank2.qb_most_important_questions m where m.is_active is true and m.semester = s.semester),
    'written', (select count(*) from qbank2.qb_mock_exams e where e.semester = s.semester),
    'viva', (select count(*) from qbank2.qb_viva_exams v where v.semester = s.semester),
    'mnemonics', (select count(*) from qbank2.hack_mnemonics x where x.semester = s.semester),
    'notes', (select count(*) from qbank2.hack_notes x where x.semester = s.semester),
    'sos', (select count(*) from qbank2.hack_sos_cards x where x.semester = s.semester),
    'taplet_papers', (select count(*) from qbank2.taplet_papers t where t.semester = s.semester),
    'taplets', (select count(*) from qbank2.taplet_tasks t where t.semester = s.semester)
  ) order by s.semester)
  from s;
$$;

create or replace function public.qbank2_mnemonics(
  p_semester integer, p_subject text default null, p_type text default null,
  p_search text default null, p_limit integer default 24, p_offset integer default 0
)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with base as (select * from qbank2.hack_mnemonics where semester = p_semester),
  hit as (
    select * from base
     where (nullif(p_subject, '') is null or subject = p_subject)
       and (nullif(p_type, '') is null or mnemonic_type = p_type)
       and (nullif(btrim(p_search), '') is null or search_text ilike '%' || btrim(p_search) || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from hit),
    'all', (select count(*) from base),
    'subjects', coalesce((select jsonb_agg(x order by x) from (select distinct subject x from base) d), '[]'::jsonb),
    'types', coalesce((select jsonb_agg(x order by x) from (select distinct mnemonic_type x from base) d), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'subject', h.subject, 'type', h.mnemonic_type, 'topic', h.topic,
        'label', h.sentence_label, 'sentence', h.sentence, 'meaning', h.meaning, 'style', h.style
      ) order by h.ord)
      from (select * from hit order by ord
             limit least(greatest(coalesce(p_limit, 24), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) h
    ), '[]'::jsonb)
  );
$$;

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
      select jsonb_agg(h.data order by h.ord)
        from (select * from hit order by ord
               limit least(greatest(coalesce(p_limit, 24), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) h
    ), '[]'::jsonb)
  );
$$;

-- p_deck: 'semester-1' … 'semester-8' or 'general'.
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
      select jsonb_agg(h.data order by h.ord)
        from (select * from hit order by ord
               limit least(greatest(coalesce(p_limit, 60), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) h
    ), '[]'::jsonb)
  );
$$;

create or replace function public.qbank2_taplet_papers(p_semester integer)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('qp', qp_code, 'title', title, 'tasks', task_count) order by qp_code), '[]'::jsonb)
    from qbank2.taplet_papers where semester = p_semester;
$$;

create or replace function public.qbank2_taplet_paper(p_qp text, p_limit integer default 1000)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'paper', (select jsonb_build_object('qp', qp_code, 'title', title, 'tasks', task_count, 'semester', semester)
                from qbank2.taplet_papers where qp_code = p_qp),
    'tasks', coalesce((select jsonb_agg(t.data order by t.ord)
                         from (select * from qbank2.taplet_tasks where qp_code = p_qp order by ord
                                limit greatest(coalesce(p_limit, 1000), 1)) t), '[]'::jsonb)
  );
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.qbank2_overview()',
    'public.qbank2_mnemonics(integer, text, text, text, integer, integer)',
    'public.qbank2_notes(integer, text, text, text, text, integer, integer)',
    'public.qbank2_sos(text, text, text, text, integer, integer)',
    'public.qbank2_taplet_papers(integer)',
    'public.qbank2_taplet_paper(text, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

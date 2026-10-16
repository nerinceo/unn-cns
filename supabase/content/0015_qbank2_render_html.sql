-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
--
-- Question Bank Pro answers formatted exactly as thinkqi.com formats them
-- (Naveen, 2026-10-16). thinkqi.com has a different formatAnswer on each page
-- (Model, Previous Years, Most Important, questions.html, Mock Exams); CNS's
-- server-side port matched only ~40-98% of answers by structure. So each
-- answer, rationale and exam tip is rendered at import time by thinkqi.com's
-- OWN page code in a headless browser (D:\2026\_backups\qbank2-import\r1016\
-- build-render.mjs) and stored here; qbank2_rpc and qbank2_saved hand it out
-- beside the raw text. CNS still sanitises it to its allowlist before use,
-- and falls back to its own formatter when a row has no rendering.
--
--   section      model | previous | important | written_key | viva_key
--   item_id      question id, or the exam id for the two answer keys
--   sub          0, or the answer key's question_order
--   renderer     which thinkqi page formatted it (model, browse = questions.html, …)
--   src_hash     md5 of the inputs, to spot a rendering left stale by an import
-- ===========================================================================

create table if not exists qbank2.render_html (
  section text not null,
  item_id bigint not null,
  sub integer not null default 0,
  renderer text not null,
  answer_html text,
  rationale_html text,
  tip_html text,
  src_hash text not null,
  primary key (section, item_id, sub)
);
revoke all on qbank2.render_html from public, anon, authenticated;
grant all on qbank2.render_html to service_role;

-- The keys a rendering adds to a row (nothing when there is none).
create or replace function qbank2.render_keys(p_section text, p_item bigint, p_sub integer default 0)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce((
    select jsonb_build_object('answer_html', r.answer_html, 'rationale_html', r.rationale_html, 'tip_html', r.tip_html)
      from qbank2.render_html r where r.section = p_section and r.item_id = p_item and r.sub = p_sub
  ), '{}'::jsonb);
$function$;
revoke all on function qbank2.render_keys(text, bigint, integer) from public, anon, authenticated;
grant execute on function qbank2.render_keys(text, bigint, integer) to service_role;

-- A question's diagram as thinkqi.com shows it: its pages read diagram_image_url
-- from qb_questions with the anon key, so the source's RLS (status, review and
-- is_published all 'Published') decides whether a diagram appears at all.
create or replace function qbank2.diagram_key(p_id bigint)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select jsonb_build_object('diagram_image_url', (
    select q.diagram_image_url from qbank2.qb_questions q
     where q.id = p_id and q.status = 'Published' and q.review_status = 'Published' and q.is_published is true));
$function$;
revoke all on function qbank2.diagram_key(bigint) from public, anon, authenticated;
grant execute on function qbank2.diagram_key(bigint) to service_role;

-- The dispatcher: as 0012, plus the rendering merged into each row (and the
-- diagram, for Previous Years, whose function does not return it).
create or replace function public.qbank2_rpc(p_fn text, p_args jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
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
    select coalesce(jsonb_agg(jsonb_set(to_jsonb(x) - 'ordinality', '{question}',
             (x.question || qbank2.render_keys('model', (x.question->>'id')::bigint))) order by x.ordinality), '[]'::jsonb) into r
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
    select coalesce(jsonb_agg((to_jsonb(x) - 'ordinality') || qbank2.render_keys('previous', x.id) || qbank2.diagram_key(x.id) order by x.ordinality), '[]'::jsonb) into r
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
    select coalesce(jsonb_agg(jsonb_set(to_jsonb(x) - 'ordinality', '{question}',
             (x.question || qbank2.render_keys('important', (x.question->>'id')::bigint))) order by x.ordinality), '[]'::jsonb) into r
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
    select coalesce(jsonb_agg((to_jsonb(x) - 'ordinality') || qbank2.render_keys('written_key', x.mock_exam_id, x.question_order) order by x.ordinality), '[]'::jsonb) into r
      from qbank2.get_mock_exam_answer_key((a->>'p_mock_exam_id')::bigint) with ordinality x;
  when 'get_viva_exam_questions' then
    select coalesce(jsonb_agg(to_jsonb(x) - 'ordinality' order by x.ordinality), '[]'::jsonb) into r
      from qbank2.get_viva_exam_questions((a->>'p_viva_exam_id')::bigint) with ordinality x;
  when 'get_viva_exam_answer_key' then
    select coalesce(jsonb_agg((to_jsonb(x) - 'ordinality') || qbank2.render_keys('viva_key', x.viva_exam_id, x.question_order) order by x.ordinality), '[]'::jsonb) into r
      from qbank2.get_viva_exam_answer_key((a->>'p_viva_exam_id')::bigint) with ordinality x;
  else
    raise exception 'qbank2_rpc: unknown function %', p_fn using errcode = '22023';
  end case;
  return r;
end;
$function$;
revoke all on function public.qbank2_rpc(text, jsonb) from public, anon, authenticated;
grant execute on function public.qbank2_rpc(text, jsonb) to service_role;

-- Saved: as 0009, plus the rendering of the list the question is shown in
-- (Model, else Previous Years, else Most Important).
create or replace function public.qbank2_saved(p_user uuid, p_kind text, p_open integer[], p_semester integer default null::integer, p_limit integer default 30, p_offset integer default 0)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with marks as (
    select k.item, k.updated_at,
           (select min(s) from unnest(public.qbank2_item_semesters(p_kind, k.item)) s
             where s = any(p_open) and (p_semester is null or s = p_semester)) as sem
      from qbank2.member_marks k
     where k.user_id = p_user and k.kind = p_kind and k.saved
  ),
  visible as (select * from marks where sem is not null),
  page as (
    select * from visible order by updated_at desc, item
     limit least(greatest(coalesce(p_limit, 30), 1), 100) offset least(greatest(coalesce(p_offset, 0), 0), 100000)
  )
  select jsonb_build_object(
    'total', (select count(*) from visible),
    'rows', coalesce(case p_kind
      when 'q' then (select jsonb_agg(jsonb_build_object(
          'id', q.id, 'question', q.question, 'question_type', q.question_type, 'marks', q.marks,
          'answer', q.answer, 'answer_formatted', q.answer_formatted, 'rationale', q.rationale, 'exam_tip', q.exam_tip,
          'correct_option', q.correct_option, 'option_a', q.option_a, 'option_b', q.option_b, 'option_c', q.option_c, 'option_d', q.option_d,
          'official_subject_name', coalesce(q.official_subject_name, q.subject_name), 'official_unit_name', coalesce(q.official_unit_name, q.unit_name),
          'diagram_needed', q.diagram_needed, 'semester', p.sem)
          || qbank2.diagram_key(q.id)
          || coalesce((select jsonb_build_object('answer_html', r.answer_html, 'rationale_html', r.rationale_html, 'tip_html', r.tip_html)
                         from qbank2.render_html r
                        where r.item_id = q.id and r.sub = 0 and r.section in ('model', 'previous', 'important')
                        order by array_position(array['model', 'previous', 'important'], r.section) limit 1), '{}'::jsonb)
          order by p.updated_at desc, p.item)
        from page p join qbank2.qb_questions q on q.id = p.item)
      when 'mnemonic' then (select jsonb_agg(jsonb_build_object(
          'id', m.id, 'subject', m.subject, 'type', m.mnemonic_type, 'topic', m.topic, 'label', m.sentence_label,
          'sentence', m.sentence, 'meaning', m.meaning, 'style', m.style, 'semester', m.semester) order by p.updated_at desc, p.item)
        from page p join qbank2.hack_mnemonics m on m.id = p.item)
      when 'note' then (select jsonb_agg(n.data || jsonb_build_object('_id', n.id, 'semester', n.semester) order by p.updated_at desc, p.item)
        from page p join qbank2.hack_notes n on n.id = p.item)
      when 'sos' then (select jsonb_agg(c.data || jsonb_build_object('_id', c.id, '_semester', c.semester) order by p.updated_at desc, p.item)
        from page p join qbank2.hack_sos_cards c on c.id = p.item)
    end, '[]'::jsonb)
  );
$function$;
revoke all on function public.qbank2_saved(uuid, text, integer[], integer, integer, integer) from public, anon, authenticated;
grant execute on function public.qbank2_saved(uuid, text, integer[], integer, integer, integer) to service_role;

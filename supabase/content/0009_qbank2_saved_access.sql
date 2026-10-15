-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
--
-- Pre-launch audit fix (2026-10-15): Save + the Saved list bypassed the
-- paywall. Saving was allowed on any item of a semester in SAMPLE mode, and
-- qbank2_marked returned full answers with no access check, so a free account
-- could save every question id and read every answer on /saved. A lapsed
-- purchase also kept everything it had saved.
--
--  * qbank2_item_semesters: every semester an item is LISTED in — the same
--    placement the lists use (Model by placement view, Previous Years by
--    semester_number, Most Important by its own semester). 0 = the general
--    SOS deck. null = no such item. CNS allows Save only when one of these is
--    bought ("full"), never in sample mode.
--  * qbank2_saved: the Saved list, restricted to items in semesters the
--    member can open NOW (p_open, worked out by CNS from the purchase).
--
-- The superseded qbank2_item_semester / qbank2_marked stay until CNS no longer
-- calls them (0010 drops them).
-- ===========================================================================

create or replace function public.qbank2_item_semesters(p_kind text, p_item bigint)
returns integer[]
language sql stable security invoker
set search_path = ''
as $$
  select case p_kind
    when 'q' then (
      select array_agg(distinct s order by s) from (
        select p.semester s from qbank2.model_question_placement p where p.id = p_item
        union all
        select q.semester_number from qbank2.qb_questions q
         where q.id = p_item and q.is_previous_university is true and q.subject_code is not null
        union all
        select m.semester from qbank2.qb_most_important_questions m
         where m.question_id = p_item and m.is_active is true
      ) x where s between 1 and 8)
    when 'mnemonic' then (select array[m.semester] from qbank2.hack_mnemonics m where m.id = p_item)
    when 'note' then (select array[n.semester] from qbank2.hack_notes n where n.id = p_item)
    when 'sos' then (select array[coalesce(c.semester, 0)] from qbank2.hack_sos_cards c where c.id = p_item)
  end;
$$;

create or replace function public.qbank2_saved(
  p_user uuid, p_kind text, p_open integer[], p_semester integer default null,
  p_limit integer default 30, p_offset integer default 0
)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
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
          'diagram_needed', q.diagram_needed, 'semester', p.sem) order by p.updated_at desc, p.item)
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
$$;

revoke all on function public.qbank2_item_semesters(text, bigint) from public, anon, authenticated;
revoke all on function public.qbank2_saved(uuid, text, integer[], integer, integer, integer) from public, anon, authenticated;
grant execute on function public.qbank2_item_semesters(text, bigint) to service_role;
grant execute on function public.qbank2_saved(uuid, text, integer[], integer, integer, integer) to service_role;

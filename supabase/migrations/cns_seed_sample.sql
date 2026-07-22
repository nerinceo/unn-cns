-- ===========================================================================
-- CNS — sample question-bank content.
--
-- Seeds one institution (RGUHS), one program (B.Sc Nursing), two subjects with
-- topics, 12 questions across four question types, and two published practice
-- sets — enough to demo browse -> attempt -> submit -> score -> review with no
-- real content.
--
-- Run AFTER cns_question_bank.sql.
--
-- Idempotent: keyed on (institution_id, source_ref) via the unique partial
-- index, and every insert uses ON CONFLICT DO UPDATE / DO NOTHING. Re-running
-- refreshes the content in place rather than duplicating it.
--
-- Content is published immediately (is_published/status = 'published') because
-- this is demo seed data. A real import must land as 'draft' for staff review —
-- see scripts/import-question-bank.mjs.
-- ===========================================================================

do $$
declare
  v_inst uuid;
  v_prog uuid;
  v_anat uuid;   -- Anatomy & Physiology
  v_fon  uuid;   -- Fundamentals of Nursing
  v_t_cardio uuid;
  v_t_resp uuid;
  v_t_vitals uuid;
  v_t_infection uuid;
  v_set_anat uuid;
  v_set_fon uuid;
  v_q uuid;
begin

-- ---------------------------------------------------------------------------
-- Institution + program
-- ---------------------------------------------------------------------------
insert into public.cns_institutions (slug, name, short_name, country, institution_type, is_active)
values ('rguhs', 'Rajiv Gandhi University of Health Sciences', 'RGUHS', 'IN', 'university', true)
on conflict (slug) do update set name = excluded.name, short_name = excluded.short_name
returning id into v_inst;
if v_inst is null then select id into v_inst from public.cns_institutions where slug = 'rguhs'; end if;

insert into public.cns_programs (institution_id, slug, name, duration_years, is_active)
values (v_inst, 'bsc-nursing', 'B.Sc Nursing', 4, true)
on conflict (coalesce(institution_id,'00000000-0000-0000-0000-000000000000'::uuid), slug)
do update set name = excluded.name
returning id into v_prog;
if v_prog is null then
  select id into v_prog from public.cns_programs where institution_id = v_inst and slug = 'bsc-nursing';
end if;

-- ---------------------------------------------------------------------------
-- Subjects
-- ---------------------------------------------------------------------------
insert into public.cns_subjects (institution_id, program_id, slug, name, year_of_study, semester, description, position, is_published)
values (v_inst, v_prog, 'anatomy-physiology', 'Anatomy & Physiology', 1, 1,
        'Structure and function of the human body, organ system by organ system.', 1, true)
on conflict (coalesce(institution_id,'00000000-0000-0000-0000-000000000000'::uuid),
             coalesce(program_id,'00000000-0000-0000-0000-000000000000'::uuid), slug)
do update set name = excluded.name, description = excluded.description, is_published = true
returning id into v_anat;
if v_anat is null then
  select id into v_anat from public.cns_subjects
   where institution_id = v_inst and program_id = v_prog and slug = 'anatomy-physiology';
end if;

insert into public.cns_subjects (institution_id, program_id, slug, name, year_of_study, semester, description, position, is_published)
values (v_inst, v_prog, 'fundamentals-of-nursing', 'Fundamentals of Nursing', 1, 1,
        'Core nursing procedures, patient safety, hygiene and infection control.', 2, true)
on conflict (coalesce(institution_id,'00000000-0000-0000-0000-000000000000'::uuid),
             coalesce(program_id,'00000000-0000-0000-0000-000000000000'::uuid), slug)
do update set name = excluded.name, description = excluded.description, is_published = true
returning id into v_fon;
if v_fon is null then
  select id into v_fon from public.cns_subjects
   where institution_id = v_inst and program_id = v_prog and slug = 'fundamentals-of-nursing';
end if;

-- ---------------------------------------------------------------------------
-- Topics
-- ---------------------------------------------------------------------------
insert into public.cns_topics (subject_id, slug, name, position, is_published) values
  (v_anat, 'cardiovascular', 'Cardiovascular System', 1, true),
  (v_anat, 'respiratory',    'Respiratory System',    2, true),
  (v_fon,  'vital-signs',    'Vital Signs',           1, true),
  (v_fon,  'infection-control','Infection Control',   2, true)
on conflict (subject_id, coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid), slug)
do update set name = excluded.name, is_published = true;

select id into v_t_cardio     from public.cns_topics where subject_id = v_anat and slug = 'cardiovascular';
select id into v_t_resp       from public.cns_topics where subject_id = v_anat and slug = 'respiratory';
select id into v_t_vitals     from public.cns_topics where subject_id = v_fon  and slug = 'vital-signs';
select id into v_t_infection  from public.cns_topics where subject_id = v_fon  and slug = 'infection-control';

-- ---------------------------------------------------------------------------
-- Question sets
-- ---------------------------------------------------------------------------
insert into public.cns_question_sets
  (institution_id, subject_id, slug, title, description, set_type, duration_minutes,
   pass_percentage, shuffle_questions, shuffle_options, show_answers_mode,
   access_type, is_published)
values
  (v_inst, v_anat, 'anatomy-practice-1', 'Anatomy & Physiology — Practice Set 1',
   'Cardiovascular and respiratory fundamentals. Mixed difficulty.',
   'practice', 15, 50, false, false, 'after_submit', 'free', true),
  (v_inst, v_fon, 'fon-practice-1', 'Fundamentals of Nursing — Practice Set 1',
   'Vital signs and infection control. Includes negative marking.',
   'practice', 12, 50, false, false, 'after_submit', 'free', true)
on conflict (coalesce(institution_id,'00000000-0000-0000-0000-000000000000'::uuid), slug)
do update set title = excluded.title, description = excluded.description, is_published = true;

select id into v_set_anat from public.cns_question_sets where institution_id = v_inst and slug = 'anatomy-practice-1';
select id into v_set_fon  from public.cns_question_sets where institution_id = v_inst and slug = 'fon-practice-1';

-- ---------------------------------------------------------------------------
-- Questions.
--
-- Each is upserted on (institution_id, source_ref), then its options are
-- deleted and re-inserted so a re-run cannot accumulate duplicates.
-- ---------------------------------------------------------------------------

-- === Anatomy: cardiovascular ==============================================
insert into public.cns_questions
  (institution_id, subject_id, topic_id, question_type, stem, explanation,
   difficulty, marks, negative_marks, source_ref, tags, status)
values (v_inst, v_anat, v_t_cardio, 'mcq_single',
  'Which chamber of the heart pumps oxygenated blood into the systemic circulation?',
  'The left ventricle has the thickest myocardium because it must generate enough pressure to perfuse the entire body. The right ventricle pumps to the lungs only, against much lower resistance.',
  'easy', 1, 0.25, 'seed-anat-001', array['heart','circulation'], 'published')
on conflict (institution_id, source_ref) where source_ref is not null do update
  set stem = excluded.stem, explanation = excluded.explanation, status = 'published'
returning id into v_q;
delete from public.cns_question_options where question_id = v_q;
insert into public.cns_question_options (question_id, position, option_text, is_correct) values
  (v_q, 1, 'Right atrium',    false),
  (v_q, 2, 'Right ventricle', false),
  (v_q, 3, 'Left atrium',     false),
  (v_q, 4, 'Left ventricle',  true);
insert into public.cns_question_set_items (set_id, question_id, position)
values (v_set_anat, v_q, 1) on conflict (set_id, question_id) do update set position = 1;

insert into public.cns_questions
  (institution_id, subject_id, topic_id, question_type, stem, explanation,
   difficulty, marks, negative_marks, source_ref, tags, status)
values (v_inst, v_anat, v_t_cardio, 'mcq_single',
  'The normal resting heart rate for a healthy adult is:',
  '60–100 beats per minute is the accepted adult range. Below 60 is bradycardia, above 100 is tachycardia — though trained athletes are commonly bradycardic at rest without pathology.',
  'easy', 1, 0.25, 'seed-anat-002', array['heart','vital-signs'], 'published')
on conflict (institution_id, source_ref) where source_ref is not null do update
  set stem = excluded.stem, explanation = excluded.explanation, status = 'published'
returning id into v_q;
delete from public.cns_question_options where question_id = v_q;
insert into public.cns_question_options (question_id, position, option_text, is_correct) values
  (v_q, 1, '40–60 beats/min',  false),
  (v_q, 2, '60–100 beats/min', true),
  (v_q, 3, '100–120 beats/min',false),
  (v_q, 4, '120–140 beats/min',false);
insert into public.cns_question_set_items (set_id, question_id, position)
values (v_set_anat, v_q, 2) on conflict (set_id, question_id) do update set position = 2;

insert into public.cns_questions
  (institution_id, subject_id, topic_id, question_type, stem, explanation,
   difficulty, marks, negative_marks, source_ref, tags, status)
values (v_inst, v_anat, v_t_cardio, 'mcq_multi',
  'Which of the following are branches of the aortic arch? (Select all that apply)',
  'The aortic arch gives rise to three branches: the brachiocephalic trunk, the left common carotid artery, and the left subclavian artery. The pulmonary trunk arises from the right ventricle, not the arch.',
  'hard', 2, 0.5, 'seed-anat-003', array['heart','vessels'], 'published')
on conflict (institution_id, source_ref) where source_ref is not null do update
  set stem = excluded.stem, explanation = excluded.explanation, status = 'published'
returning id into v_q;
delete from public.cns_question_options where question_id = v_q;
insert into public.cns_question_options (question_id, position, option_text, is_correct) values
  (v_q, 1, 'Brachiocephalic trunk',        true),
  (v_q, 2, 'Left common carotid artery',   true),
  (v_q, 3, 'Left subclavian artery',       true),
  (v_q, 4, 'Pulmonary trunk',              false);
insert into public.cns_question_set_items (set_id, question_id, position)
values (v_set_anat, v_q, 3) on conflict (set_id, question_id) do update set position = 3;

insert into public.cns_questions
  (institution_id, subject_id, topic_id, question_type, stem, explanation,
   difficulty, marks, negative_marks, source_ref, tags, status)
values (v_inst, v_anat, v_t_cardio, 'true_false',
  'The tricuspid valve lies between the left atrium and the left ventricle.',
  'False. The tricuspid valve is on the RIGHT side, between right atrium and right ventricle. The left side has the bicuspid (mitral) valve. A useful mnemonic: LAB RAT — Left Atrium Bicuspid, Right Atrium Tricuspid.',
  'medium', 1, 0.25, 'seed-anat-004', array['heart','valves'], 'published')
on conflict (institution_id, source_ref) where source_ref is not null do update
  set stem = excluded.stem, explanation = excluded.explanation, status = 'published'
returning id into v_q;
delete from public.cns_question_options where question_id = v_q;
insert into public.cns_question_options (question_id, position, option_text, is_correct) values
  (v_q, 1, 'True',  false),
  (v_q, 2, 'False', true);
insert into public.cns_question_set_items (set_id, question_id, position)
values (v_set_anat, v_q, 4) on conflict (set_id, question_id) do update set position = 4;

-- === Anatomy: respiratory =================================================
insert into public.cns_questions
  (institution_id, subject_id, topic_id, question_type, stem, explanation,
   difficulty, marks, negative_marks, source_ref, tags, status)
values (v_inst, v_anat, v_t_resp, 'mcq_single',
  'Gas exchange in the lungs occurs across the walls of the:',
  'Alveoli are the functional unit of gas exchange — thin-walled sacs surrounded by pulmonary capillaries. Bronchi and bronchioles are conducting airways only; no exchange occurs there (anatomical dead space).',
  'easy', 1, 0.25, 'seed-anat-005', array['lungs','gas-exchange'], 'published')
on conflict (institution_id, source_ref) where source_ref is not null do update
  set stem = excluded.stem, explanation = excluded.explanation, status = 'published'
returning id into v_q;
delete from public.cns_question_options where question_id = v_q;
insert into public.cns_question_options (question_id, position, option_text, is_correct) values
  (v_q, 1, 'Bronchi',      false),
  (v_q, 2, 'Bronchioles',  false),
  (v_q, 3, 'Alveoli',      true),
  (v_q, 4, 'Trachea',      false);
insert into public.cns_question_set_items (set_id, question_id, position)
values (v_set_anat, v_q, 5) on conflict (set_id, question_id) do update set position = 5;

insert into public.cns_questions
  (institution_id, subject_id, topic_id, question_type, stem, explanation, answer_key,
   difficulty, marks, negative_marks, source_ref, tags, status)
values (v_inst, v_anat, v_t_resp, 'fill_blank',
  'The muscular sheet separating the thoracic and abdominal cavities, and the primary muscle of inspiration, is the ______.',
  'The diaphragm contracts and flattens during inspiration, increasing thoracic volume and lowering intrapleural pressure so air flows in. It is innervated by the phrenic nerve (C3–C5) — "C3, 4, 5 keeps the diaphragm alive".',
  '{"accepted": ["diaphragm", "the diaphragm"]}'::jsonb,
  'medium', 1, 0, 'seed-anat-006', array['lungs','muscles'], 'published')
on conflict (institution_id, source_ref) where source_ref is not null do update
  set stem = excluded.stem, explanation = excluded.explanation, answer_key = excluded.answer_key, status = 'published'
returning id into v_q;
insert into public.cns_question_set_items (set_id, question_id, position)
values (v_set_anat, v_q, 6) on conflict (set_id, question_id) do update set position = 6;

-- === Fundamentals: vital signs ============================================
insert into public.cns_questions
  (institution_id, subject_id, topic_id, question_type, stem, explanation,
   difficulty, marks, negative_marks, source_ref, tags, status)
values (v_inst, v_fon, v_t_vitals, 'mcq_single',
  'Which site gives the most accurate assessment of core body temperature in a critically ill adult?',
  'Core temperature is best reflected by rectal (or oesophageal/bladder in ICU) measurement. Axillary is the least accurate and typically reads about 0.5 °C below core; oral is affected by recent intake and mouth breathing.',
  'medium', 1, 0.25, 'seed-fon-001', array['temperature','assessment'], 'published')
on conflict (institution_id, source_ref) where source_ref is not null do update
  set stem = excluded.stem, explanation = excluded.explanation, status = 'published'
returning id into v_q;
delete from public.cns_question_options where question_id = v_q;
insert into public.cns_question_options (question_id, position, option_text, is_correct) values
  (v_q, 1, 'Axillary', false),
  (v_q, 2, 'Oral',     false),
  (v_q, 3, 'Rectal',   true),
  (v_q, 4, 'Temporal', false);
insert into public.cns_question_set_items (set_id, question_id, position)
values (v_set_fon, v_q, 1) on conflict (set_id, question_id) do update set position = 1;

insert into public.cns_questions
  (institution_id, subject_id, topic_id, question_type, stem, explanation,
   difficulty, marks, negative_marks, source_ref, tags, status)
values (v_inst, v_fon, v_t_vitals, 'mcq_single',
  'A blood pressure cuff that is too narrow for the patient''s arm will produce a reading that is:',
  'An undersized cuff cannot distribute pressure evenly, so more pressure is needed to occlude the artery and the reading is falsely HIGH. An oversized cuff gives a falsely low reading. Cuff bladder width should be roughly 40% of arm circumference.',
  'hard', 2, 0.5, 'seed-fon-002', array['blood-pressure','assessment'], 'published')
on conflict (institution_id, source_ref) where source_ref is not null do update
  set stem = excluded.stem, explanation = excluded.explanation, status = 'published'
returning id into v_q;
delete from public.cns_question_options where question_id = v_q;
insert into public.cns_question_options (question_id, position, option_text, is_correct) values
  (v_q, 1, 'Falsely high',            true),
  (v_q, 2, 'Falsely low',             false),
  (v_q, 3, 'Unaffected',              false),
  (v_q, 4, 'Falsely low systolic only',false);
insert into public.cns_question_set_items (set_id, question_id, position)
values (v_set_fon, v_q, 2) on conflict (set_id, question_id) do update set position = 2;

insert into public.cns_questions
  (institution_id, subject_id, topic_id, question_type, stem, explanation,
   difficulty, marks, negative_marks, source_ref, tags, status)
values (v_inst, v_fon, v_t_vitals, 'mcq_single',
  'The normal respiratory rate range for a resting adult is:',
  '12–20 breaths per minute. Below 12 is bradypnoea, above 20 tachypnoea. Respiratory rate is the earliest and most sensitive indicator of clinical deterioration, and also the most frequently omitted observation.',
  'easy', 1, 0.25, 'seed-fon-003', array['respiration','assessment'], 'published')
on conflict (institution_id, source_ref) where source_ref is not null do update
  set stem = excluded.stem, explanation = excluded.explanation, status = 'published'
returning id into v_q;
delete from public.cns_question_options where question_id = v_q;
insert into public.cns_question_options (question_id, position, option_text, is_correct) values
  (v_q, 1, '8–12 breaths/min',  false),
  (v_q, 2, '12–20 breaths/min', true),
  (v_q, 3, '20–28 breaths/min', false),
  (v_q, 4, '28–36 breaths/min', false);
insert into public.cns_question_set_items (set_id, question_id, position)
values (v_set_fon, v_q, 3) on conflict (set_id, question_id) do update set position = 3;

-- === Fundamentals: infection control ======================================
insert into public.cns_questions
  (institution_id, subject_id, topic_id, question_type, stem, explanation,
   difficulty, marks, negative_marks, source_ref, tags, status)
values (v_inst, v_fon, v_t_infection, 'mcq_single',
  'According to WHO guidance, the single most effective measure for preventing healthcare-associated infection is:',
  'Hand hygiene. It is simple, cheap and consistently the highest-impact intervention — which is why WHO built the "5 Moments for Hand Hygiene" around it. Gloves supplement hand hygiene; they never replace it.',
  'easy', 1, 0.25, 'seed-fon-004', array['infection-control','hygiene'], 'published')
on conflict (institution_id, source_ref) where source_ref is not null do update
  set stem = excluded.stem, explanation = excluded.explanation, status = 'published'
returning id into v_q;
delete from public.cns_question_options where question_id = v_q;
insert into public.cns_question_options (question_id, position, option_text, is_correct) values
  (v_q, 1, 'Wearing gloves at all times',   false),
  (v_q, 2, 'Hand hygiene',                  true),
  (v_q, 3, 'Prophylactic antibiotics',      false),
  (v_q, 4, 'Daily surface disinfection',    false);
insert into public.cns_question_set_items (set_id, question_id, position)
values (v_set_fon, v_q, 4) on conflict (set_id, question_id) do update set position = 4;

insert into public.cns_questions
  (institution_id, subject_id, topic_id, question_type, stem, explanation,
   difficulty, marks, negative_marks, source_ref, tags, status)
values (v_inst, v_fon, v_t_infection, 'mcq_multi',
  'Which of the following are among the WHO "5 Moments for Hand Hygiene"? (Select all that apply)',
  'The five moments are: before touching a patient, before a clean/aseptic procedure, after body fluid exposure risk, after touching a patient, and after touching patient surroundings. Handwashing at the start of a shift is good practice but is not one of the five moments.',
  'hard', 2, 0.5, 'seed-fon-005', array['infection-control','who'], 'published')
on conflict (institution_id, source_ref) where source_ref is not null do update
  set stem = excluded.stem, explanation = excluded.explanation, status = 'published'
returning id into v_q;
delete from public.cns_question_options where question_id = v_q;
insert into public.cns_question_options (question_id, position, option_text, is_correct) values
  (v_q, 1, 'Before touching a patient',              true),
  (v_q, 2, 'Before a clean/aseptic procedure',       true),
  (v_q, 3, 'After body fluid exposure risk',         true),
  (v_q, 4, 'On arrival at the start of your shift',  false);
insert into public.cns_question_set_items (set_id, question_id, position)
values (v_set_fon, v_q, 5) on conflict (set_id, question_id) do update set position = 5;

insert into public.cns_questions
  (institution_id, subject_id, topic_id, question_type, stem, explanation,
   difficulty, marks, negative_marks, source_ref, tags, status)
values (v_inst, v_fon, v_t_infection, 'assertion_reason',
  'Assertion (A): Alcohol-based hand rub is not effective against Clostridioides difficile spores.' || chr(10) ||
  'Reason (R): C. difficile forms spores with a protective coat that alcohol cannot penetrate.' || chr(10) || chr(10) ||
  'Select the correct option:',
  'Both A and R are true, and R correctly explains A. Because alcohol does not kill C. difficile spores, soap-and-water handwashing (mechanical removal) is required when caring for these patients — a common exam point and a real clinical trap.',
  'hard', 2, 0.5, 'seed-fon-006', array['infection-control','c-diff'], 'published')
on conflict (institution_id, source_ref) where source_ref is not null do update
  set stem = excluded.stem, explanation = excluded.explanation, status = 'published'
returning id into v_q;
delete from public.cns_question_options where question_id = v_q;
insert into public.cns_question_options (question_id, position, option_text, is_correct) values
  (v_q, 1, 'Both A and R are true, and R is the correct explanation of A',     true),
  (v_q, 2, 'Both A and R are true, but R is NOT the correct explanation of A', false),
  (v_q, 3, 'A is true but R is false',                                         false),
  (v_q, 4, 'A is false but R is true',                                         false);
insert into public.cns_question_set_items (set_id, question_id, position)
values (v_set_fon, v_q, 6) on conflict (set_id, question_id) do update set position = 6;

-- ---------------------------------------------------------------------------
-- Total marks, derived rather than hardcoded so it stays honest if items move.
-- ---------------------------------------------------------------------------
update public.cns_question_sets s
   set total_marks = sub.total
  from (select i.set_id, sum(coalesce(i.marks_override, q.marks)) as total
          from public.cns_question_set_items i
          join public.cns_questions q on q.id = i.question_id
         group by i.set_id) sub
 where s.id = sub.set_id and s.id in (v_set_anat, v_set_fon);

raise notice 'CNS seed complete: institution=% program=% subjects=2 sets=2', v_inst, v_prog;

end $$;

-- ---------------------------------------------------------------------------
-- Verification. Expect: 2 subjects, 4 topics, 12 questions, 2 sets, 12 items.
-- ---------------------------------------------------------------------------
select 'institutions' as entity, count(*) from public.cns_institutions where slug = 'rguhs'
union all select 'subjects',      count(*) from public.cns_subjects  where is_published
union all select 'topics',        count(*) from public.cns_topics    where is_published
union all select 'questions',     count(*) from public.cns_questions where status = 'published'
union all select 'options',       count(*) from public.cns_question_options
union all select 'sets',          count(*) from public.cns_question_sets where is_published
union all select 'set items',     count(*) from public.cns_question_set_items;

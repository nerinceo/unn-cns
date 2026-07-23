-- ---------------------------------------------------------------------------
-- Revision bank: carry the source's diagram guidance.
--
-- The RGUHS source never generated diagram IMAGES (diagram_status is
-- 'Not Added' on every row, diagram_image_url is empty everywhere). What it
-- does have, on 607 questions, is a diagram_note — a text description of the
-- diagram the ideal answer should include ("Draw a cell showing reversible
-- injury, label at least 5 structures").
--
-- That is answer guidance, distinct from the model answer prose, so it gets its
-- own column and its own section in the UI rather than being mashed into
-- model_answer.
--
-- One additive column. No constraint, no data migration here — the import
-- script backfills it by source_ref.
-- ---------------------------------------------------------------------------

alter table public.cns_study_questions
  add column if not exists diagram_note text;

-- --- verification --------------------------------------------------------
select column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'cns_study_questions'
   and column_name = 'diagram_note';

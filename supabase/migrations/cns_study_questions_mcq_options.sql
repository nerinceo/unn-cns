-- Bring MCQs into the browse bank.
--
-- The Nursing Bank browse tree mirrors unnhub.org/nursingbank, where ONE flat
-- list carries every question type together — MCQs sit inline with essays and
-- viva questions, options and answer visible behind "Show Answer".
--
-- CNS split them: cns_questions holds MCQs for timed, auto-graded practice sets
-- and has its answer-key columns REVOKED from `authenticated` (that revocation
-- is the mechanism keeping answer keys out of the browser, and it must stay).
-- Reading MCQs from there for a browse page would either render blanks or force
-- us to hand out the key for every graded set.
--
-- So browse MCQs live in cns_study_questions instead — published content a
-- signed-in learner may read in full, no revoked columns. That leaves
-- cns_questions untouched for grading, and makes the browse bank a single-table
-- read whose totals match the source exactly (8,929) instead of splitting into
-- "929 listed, 168 counted elsewhere".
--
-- These five columns are what cns_study_questions was missing to hold one.
-- Additive and re-runnable; nothing existing changes.

alter table public.cns_study_questions
  add column if not exists option_a text,
  add column if not exists option_b text,
  add column if not exists option_c text,
  add column if not exists option_d text,
  add column if not exists correct_option text;

comment on column public.cns_study_questions.correct_option is
  'A/B/C/D for source_question_type = ''MCQ''. Null for written questions. Readable by members: this is the browse bank, not the graded one — cns_questions keeps its key revoked.';

-- Browse reads filter on type within a set of subjects; this keeps the MCQ
-- filter chip from degrading into a scan once MCQs land in the table.
create index if not exists cns_study_questions_type_subject_idx
  on public.cns_study_questions (subject_id, source_question_type)
  where status = 'published';

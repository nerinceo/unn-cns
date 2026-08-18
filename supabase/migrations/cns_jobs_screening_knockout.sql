-- ============================================================================
-- CNS Jobs — knockout rules on screening questions
-- ----------------------------------------------------------------------------
-- Additive + idempotent. Run in Supabase Dashboard > SQL Editor.
-- Touches CNS tables only. No HUB table is altered.
--
-- WHY
--
--   Screening questions already existed and were already answered — the
--   answers land in cns_application_answers with the question text frozen
--   alongside. Nobody ever scored them. A recruiter with 200 applicants still
--   opened 200 cards to find the twelve with the right licence.
--
--   A knockout rule is the employer stating, at authoring time, what the
--   answer has to be. Evaluation happens at READ time against the stored
--   answers rather than being stamped onto the application row, for two
--   reasons: an employer who fixes a badly worded rule sees the pipeline
--   re-sort immediately, and no historical answer is ever mutated.
--
--   NOT AUTO-REJECTION. A failed rule tags an application; it never changes
--   its status and never hides it. A nurse whose licence is three weeks from
--   being issued is exactly the person a hard filter would silently discard,
--   and the employer keeps the judgement call.
-- ============================================================================

-- 1. A numeric question type ---------------------------------------------------
-- "How many years of ICU experience?" was previously a short_answer, which is
-- unscoreable: "3", "three", "3.5 yrs" and "~4" are all valid free text.
alter table public.cns_job_screening_questions
  drop constraint if exists cns_job_screening_questions_question_type_check;

alter table public.cns_job_screening_questions
  add constraint cns_job_screening_questions_question_type_check
  check (question_type in ('short_answer', 'yes_no', 'number'));

-- 2. The rule ------------------------------------------------------------------
-- Nullable on purpose: a question with no rule is still a perfectly good
-- question, and every question that exists today keeps working untouched.
alter table public.cns_job_screening_questions
  add column if not exists knockout_expected text
    check (knockout_expected is null or knockout_expected in ('yes', 'no'));

alter table public.cns_job_screening_questions
  add column if not exists knockout_min numeric(6,1);

comment on column public.cns_job_screening_questions.knockout_expected is
  'yes_no questions: the answer required to meet the bar. NULL = no rule.';
comment on column public.cns_job_screening_questions.knockout_min is
  'number questions: the minimum answer required to meet the bar. NULL = no rule.';

-- A rule only makes sense against the matching question type. Without this an
-- employer could set knockout_min on a yes/no question and get a criterion
-- that can never be met by any answer.
alter table public.cns_job_screening_questions
  drop constraint if exists cns_screening_rule_matches_type;

alter table public.cns_job_screening_questions
  add constraint cns_screening_rule_matches_type check (
    (knockout_expected is null or question_type = 'yes_no') and
    (knockout_min      is null or question_type = 'number')
  );

-- 3. Verify --------------------------------------------------------------------
select 'screening questions' as check, count(*)::text as value
  from public.cns_job_screening_questions
union all
select 'with a knockout rule', count(*)::text
  from public.cns_job_screening_questions
  where knockout_expected is not null or knockout_min is not null;

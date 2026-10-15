-- ===========================================================================
-- CONTENT project (ifptcsqckjanmnzvvcxs) — NOT the main UNN project.
-- Run in that project's Supabase Dashboard > SQL Editor. Re-runnable.
-- Run only AFTER the CNS deploy that calls qbank2_saved / qbank2_item_semesters.
--
-- Pre-launch audit cleanup (2026-10-15):
--  * Functions CNS no longer calls: the old Saved list and item lookup
--    (superseded by 0009), progress figures and self scores (both removed
--    from the product), and the served-HTML page reader (archived).
--  * The "public can read" RLS policies copied from nerusalem.in. Inert today
--    (anon/authenticated have no USAGE on qbank2), but one stray schema grant
--    would turn them into an open door to every question and answer.
-- ===========================================================================

drop function if exists public.qbank2_marked(uuid, text, text, integer, integer, integer);
drop function if exists public.qbank2_item_semester(text, bigint);
drop function if exists public.qbank2_progress(uuid, integer);
drop function if exists public.qbank2_attempt_score(uuid, text, bigint, numeric);
drop function if exists public.qbank2_page(text);

drop policy if exists "Public can read published questions" on qbank2.qb_questions;
drop policy if exists "Public can read subjects" on qbank2.qb_subjects;
drop policy if exists "Public can read topics" on qbank2.qb_topics;
drop policy if exists "Public can read units" on qbank2.qb_units;
drop policy if exists "Anon can read active important questions" on qbank2.qb_most_important_questions;

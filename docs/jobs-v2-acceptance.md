# Jobs v2 — Manual Acceptance Test Plan

> Scope: ranked search + pagination, match scoring, the new candidate filters,
> the employer pipeline, knockout screening, view analytics, employer profile
> pages, and the email path.
>
> Gate: **a nurse can find, rank and filter roles across more than one page; an
> employer can triage a pipeline and see whether anyone is looking — and nothing
> that worked before is worse.**

---

## 0. Pre-flight — migrations BEFORE code

**This order is not optional.** `searchPublishedJobs()` calls the
`cns_search_jobs` RPC. If the code deploys first, the RPC does not exist, the
call errors, and the board renders **zero jobs** — a total outage of /jobs, not
a degraded page.

| # | Step | Expected |
|---|---|---|
| 0.1 | SQL Editor → run `supabase/migrations/cns_jobs_search.sql` | No errors. Final SELECT reports active-job count, indexed count (must match), and an RPC smoke row |
| 0.2 | Re-run `cns_jobs_search.sql` a second time | Still no errors (idempotency) |
| 0.3 | Run `cns_jobs_screening_knockout.sql`, then re-run it | No errors both times |
| 0.4 | Run `cns_job_views.sql`, then re-run it | No errors both times |
| 0.5 | `select count(*) from cns_jobs where search_tsv is null;` | `0` |
| 0.6 | `select proname, prosecdef from pg_proc where proname in ('cns_search_jobs','cns_record_job_view','cns_job_view_stats');` | `cns_record_job_view` = `t` (definer); the other two = `f` (invoker) |
| 0.7 | Deploy CNS | Build green |

> If 0.6 shows `cns_search_jobs` as SECURITY DEFINER, stop — that would bypass
> RLS on cns_jobs. It must be invoker.

---

## 1. Search correctness (the defects this fixes)

| # | Step | Expected |
|---|---|---|
| 1.1 | `/jobs?q=<a hospital's name>` | Its roles appear. **Before this change this returned nothing** — employer name was never searched |
| 1.2 | `/jobs?q=<a specialty slug, e.g. icu>` | Roles in that specialty appear |
| 1.3 | Search a word that appears only in one job's description | That job appears |
| 1.4 | Search a word in a job **title** and the same word in another job's **body** | The title match ranks above the body match |
| 1.5 | Search `%` or `,` or `' OR 1=1 --` | No error, no crash, sensible empty state |
| 1.6 | Search a nonsense string | Empty state with a "Clear all filters" link |

## 2. Pagination

Needs **more than 20 active jobs**. Seed if necessary.

| # | Step | Expected |
|---|---|---|
| 2.1 | `/jobs?q=nurse` | Footer reads `1–20 of N`. Pager shows page numbers |
| 2.2 | Click **Next** | URL gains `?page=2`, results change, footer reads `21–40 of N` |
| 2.3 | Copy the page-2 URL into a new tab | Same page 2 renders (state is in the URL, shareable) |
| 2.4 | On page 3, tick a filter that narrows results to one page | Lands on page 1, **not** an empty page 3 |
| 2.5 | Change sort while on page 2 | Returns to page 1 |
| 2.6 | `?page=999` | Empty state, no crash |
| 2.7 | `?page=-5` and `?page=abc` | Treated as page 1 |

## 3. Sorting

| # | Step | Expected |
|---|---|---|
| 3.1 | Default (no `sort` param) | "Most relevant" selected |
| 3.2 | With no keyword, relevance selected | Falls back to newest-first (rank is 0 for everything) |
| 3.3 | "Newest first" | Ordered by published date descending |
| 3.4 | "Closing soon" | Jobs with a deadline first, soonest first; jobs with no deadline last |
| 3.5 | Confirm there is **no** "Highest salary" option | Correct — mixed currencies make it meaningless. Do not add it without a normalised column |

## 4. New filters

| # | Step | Expected |
|---|---|---|
| 4.1 | Date posted → **Last week** | Only jobs published in 7 days. A chip appears |
| 4.2 | Click the same radio again | Filter clears (radio groups must have an escape) |
| 4.3 | **Offers visa sponsorship** | Only sponsoring roles. Each card shows the "Visa sponsorship" line |
| 4.4 | **Remote only** | Only `is_remote` roles |
| 4.5 | Apply all three + two taxonomy filters, then **Clear all** | Filters clear; **keyword and sort survive** |
| 4.6 | As an employer, tick "Visa sponsorship available" on a job, publish, then filter for it on /jobs | The job appears. (If this fails, `visa_sponsorship` is missing from `JOB_EDITABLE_FIELDS`) |

## 5. Match scoring — candidate side

Use a member with a filled job profile (role, specialties, preferred countries).

| # | Step | Expected |
|---|---|---|
| 5.1 | Signed out, visit /jobs | **No** match badges anywhere |
| 5.2 | Signed in with an **empty** profile | No percentages. Directory shows a "Complete your profile" prompt instead of a rail |
| 5.3 | Signed in with a filled profile, /jobs (no filters) | "Recommended for you" rail above the directory, at most 5 roles, all ≥60% |
| 5.4 | Check a recommended card's reasons | Reasons match reality (specialty/role/country as stated on the profile) |
| 5.5 | Find a role below your stated minimum experience | Amber gap chip: "Asks for N+ years experience" |
| 5.6 | A **remote** job in a country you did NOT list | Country is not counted as a miss (remote is location-agnostic) |
| 5.7 | Set profile to a role with no matching jobs | Rail disappears entirely rather than showing weak matches |

## 6. Employer pipeline

Needs a job with several applications at different statuses.

> **Use an `account_scope='full'` account.** CNS middleware redirects
> `account_scope='uhn'` users to UHN, so hospital-staff accounts cannot open the
> CNS employer portal at all — the page bounces to `uhn.nerusalem.com/login`.
> The seeded Sacred Heart employer accounts are all `uhn`; `UNN Demo Hospital`
> (`demo.admin.tour@example.com`) is `full` and works. This is correct
> behaviour, but it will look like a broken page if you test with the wrong
> account.

| # | Step | Expected |
|---|---|---|
| 6.1 | `/employer/<id>/applications` | Stage tabs with counts: All, Applied, Under review, Shortlisted, Interview, Selected |
| 6.2 | Empty terminal stages | "Not selected" / "Withdrawn" tabs hidden when zero; "Shortlisted" stays visible at zero |
| 6.3 | Click a stage | Only that stage's applications |
| 6.4 | Search an applicant's name | Filters within the stage |
| 6.5 | Search a **job title** | Also matches |
| 6.6 | Sort → **Best match** | Highest fit first; unscoreable (no seeker data) sink to the bottom |
| 6.7 | Shortlist someone | Card moves to the Shortlisted tab after refresh; counts update; **contact details appear** |
| 6.8 | Confirm contact details are hidden at Applied / Under review | Still hidden — the apply-screen promise |
| 6.9 | On a phone-width viewport | Tabs wrap, cards are readable, nothing scrolls horizontally |

## 7. Knockout screening

| # | Step | Expected |
|---|---|---|
| 7.1 | Job editor → add a **Yes / No** question, set "Meets criteria when the answer is: Yes" | Saves |
| 7.2 | Add a **Number** question, set "Meets criteria at 3 or above" | Saves |
| 7.3 | Switch a question's type after setting a rule | The rule clears (a "must be yes" on a numeric question can never be met) |
| 7.4 | Try to set a rule and save 6 questions | Blocked at 5 (DB trigger) |
| 7.5 | Apply as a nurse | Number question renders a **numeric** input; yes/no renders a select |
| 7.6 | Answer to meet both rules | Employer inbox shows a green "Meets criteria" tag |
| 7.7 | Answer to fail one | Amber "Meets 1 of 2 criteria". Hovering shows which and why |
| 7.8 | Leave a rule question blank (not required) | Counted as **not met**, never as a pass |
| 7.9 | Tick "Meets criteria only" | Filters to qualifying applicants; count is correct |
| 7.10 | **Confirm nothing was auto-rejected** | Every application still present at its original status. Rules tag, never reject |
| 7.11 | Edit a rule after applications exist, reload | Tags re-evaluate immediately; **stored answers unchanged** |

## 8. View analytics

| # | Step | Expected |
|---|---|---|
| 8.1 | Open a live job as a signed-out visitor | `select views_count from cns_jobs where id=...` increments by 1 |
| 8.2 | Refresh that page 5 times | Count does **not** move (deduped per viewer per day) |
| 8.3 | Open it in a different browser/profile | Count increments by 1 |
| 8.4 | Open a **draft** job as its employer | Count does **not** move — previews must not inflate |
| 8.5 | Employer dashboard | "Views" tile, and a "How your live roles are performing" table with views, applications and a per-role rate |
| 8.6 | A role with <20 views | Reads "Low visibility so far" |
| 8.7 | A role with many views and almost no applications | Reads "Seen, but few apply — check the pay and requirements" |
| 8.8 | Brand-new employer, no views yet | Friendly "No views recorded yet" line, not a division-by-zero or `NaN%` |
| 8.9 | `select * from cns_job_views limit 1;` as a normal user | Denied. Raw viewing history must not be readable |

## 9. Employer profile pages

| # | Step | Expected |
|---|---|---|
| 9.1 | `/employers/<approved-slug>` | Logo, name, verified badge, type, location, website, description, and their open roles |
| 9.2 | `/employers/<pending-or-rejected-slug>` | 404. UNN must not appear to vouch for an unapproved organisation |
| 9.3 | `/employers/<nonexistent>` | 404 |
| 9.4 | Job detail page → click the employer name | Lands on their profile |
| 9.5 | Jobs directory → "Verified employers" chips | Now links, not dead spans |
| 9.6 | An approved employer with zero live roles | Renders with an empty-state message, does not 404 |
| 9.7 | View source | `Organization` JSON-LD present and well-formed |
| 9.8 | `/sitemap.xml` | Contains `/employers/<slug>` entries **and** every active job (not capped at 50) |

## 10. Email path

| # | Step | Expected |
|---|---|---|
| 10.1 | **With `RESEND_API_KEY` unset**, shortlist an applicant | In-app notification written. No email. No error anywhere |
| 10.2 | Set `RESEND_API_KEY` + `CNS_EMAIL_FROM`, redeploy, shortlist someone | Applicant receives an email. In-app notification still written |
| 10.3 | Move an application to **Under review** | In-app only — deliberately no email |
| 10.4 | Move to interview / selected / not selected | Email for each, honestly worded subject lines |
| 10.5 | Submit an application | Every approved employer member is notified |
| 10.6 | Set an obviously invalid `RESEND_API_KEY`, shortlist someone | Status change still succeeds. Error logged, **not** shown to the employer |
| 10.7 | Read an email on a phone | Light background, single column, working CTA. No black backgrounds |

## 11. Regression sweep (nothing that worked is worse)

| # | Step | Expected |
|---|---|---|
| 11.1 | /jobs with no filters, signed out | Directory renders with facet counts as before |
| 11.2 | Existing taxonomy filters (country, role, specialty, type, setting, experience) | All still work, still multi-select, still chip-removable |
| 11.3 | Apply to a job with no screening questions | Works exactly as before |
| 11.4 | An existing screening question with **no** rule | Still renders and still collects an answer; no tag on the card |
| 11.5 | Member home job rail | Still shows 4 roles |
| 11.6 | `/jobs/[slug]` JobPosting JSON-LD | Unchanged and still valid |
| 11.7 | Question bank, resume builder, LMS, progress | Untouched — spot-check one page each |
| 11.8 | `npm run check:drift` in unn-cns | All 13 mirrored files in sync |
| 11.9 | UHN `/jobs` and org job management | Still work (schema changes are additive) |

---

## Bugs this testing found and fixed

Recorded so a reviewer knows they were caught, not missed.

| Bug | Why it mattered |
|---|---|
| `ts_rank(tsquery, tsvector)` argument order in `cns_jobs_search.sql` | Migration would not apply at all |
| `/employers/` absent from middleware `PUBLIC_PATHS` | The crawlable, sitemap-declared page redirected anonymous visitors — including Googlebot — to HUB, defeating its entire purpose |
| `/employers/[slug]` had no layout | Rendered with no header, nav, footer or sign-in CTA |
| Sponsorship reason appended last in `scoreJobMatch` | The 3-reason cap truncated away the most decisive fact for an internationally educated nurse |
| `toLocaleDateString()` in `ApplicationCard` | Server rendered `7/8/2026`, client `07/08/2026` — a hydration mismatch that discarded the server render for the whole root. Now `formatDate()` in `lib/utils/date.ts`, which also removes the 7 Aug / 8 Jul ambiguity across the countries this product serves |

**Same latent hydration bug, NOT fixed** (outside this change's scope, pre-existing):
`components/employer/VerificationPanel.tsx`, `components/resume/ResumeUpload.tsx`
and `components/lms/InstructorSettings.tsx` all call `toLocaleDateString()` in
client components. Switching them to `formatDate()` is a one-line change each.
The `app/**/page.tsx` callers are server components and do not hydrate, so they
are cosmetic only.

## Known gaps, deliberately not shipped

- **Salary filter and salary sort.** `salary_min`/`salary_max` are stored in each
  employer's own currency with no normalised column. Filtering or ordering
  across them compares 40,000 INR to 40,000 GBP. Needs a monthly-equivalent
  column written at save time — a real project, not a WHERE clause.
- **Candidate sourcing / talent search for employers.** Still inbound-only.
- **Employer ↔ candidate messaging.** Still leaves the platform at shortlist.
- **Interview scheduling.** No calendar, no slots.
- **UHN pre-existing bug (not caused by this work):** `lib/uhn/jobs.ts`
  `getScreeningQuestions()` selects `question_text` from
  `cns_job_screening_questions`, where the column is `question`. The query
  errors and silently returns `[]`, so UHN shows no screening questions at all.

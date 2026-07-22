# UNN CNS — System Design

How the four CNS modules are built, and why. Grounded in what the market
leaders actually do, not invented from scratch.

**Status:** question bank shipped. LMS, resume builder and jobs designed here.

---

## 0. Non-negotiables

These are already load-bearing. Every module inherits them.

| Principle | Consequence |
|---|---|
| **HUB owns identity.** CNS has no login UI at all. | Session arrives via the `.unnhub.org` cookie, verified locally against the shared JWKS. Never build auth here. |
| **CNS never gains a capability it doesn't need.** | No Stripe, Resend, Firebase or `R2_DIGITAL_BUCKET`. A runaway loop cannot charge, email or reach paid content. Grant one at a time. |
| **Additive-only migrations.** | `cns_*` tables only. Never `ALTER` a HUB table. The one permitted coupling is an inbound FK to `public.users(id)`. |
| **Secrets live in the database, not in application code.** | Answer keys are unreadable by `authenticated` — enforced by column grants, not by filtering in JS. This pattern repeats for anything that must not reach the browser. |
| **Commerce stays in HUB.** | CNS asks "does this user own it?" via one read-only view. It never sees an R2 key. |

**The identity moat.** UNN knows who is a *verified nurse*. Indeed, LinkedIn and
Zety do not. Every module should lean on that — it's the only thing here that
can't be trivially copied.

---

## 1. Question Bank

Shipped: browse → attempt → grade → review, with negative marking, multi-select
set equality, free-text matching, topic mastery and item statistics.

### 1.1 The secrecy pattern (already built — reuse it)

RLS filters **rows**, not **columns**. A learner who can read a published
question can read every column of it. So:

```sql
revoke select on public.cns_questions from anon, authenticated;
grant  select (id, stem, ...safe columns only) on public.cns_questions to authenticated;
```

Grading runs in `SECURITY DEFINER` functions. **`select('*')` is now a runtime
error on these tables** — every query enumerates columns, kept in named
constants in `lib/cns/question-bank.ts`.

Apply the same pattern to any future "secret column": correct answers, employer
private notes, unpublished content.

### 1.2 Adaptive practice — what to build next

Two industry standards worth knowing, in ascending order of effort:

**Item difficulty.** `cns_question_stats.difficulty_index` is already a
*p-value* (proportion correct) — classical test theory, exactly what most
question banks use. Good enough for "hardest questions" and for flagging broken
items (a p-value near 0 usually means a miskeyed answer, not a hard question —
worth an admin alert).

**Spaced repetition.** SM-2 (SuperMemo, 1987) tracks one "ease factor" per item.
**FSRS** (2022, FSRS-6 shipped late 2025, trained on ~700M reviews) models three
variables per item — *stability*, *difficulty*, *retrievability* — with 17
trainable weights, and delivers roughly **20% fewer reviews at the same
retention**. Anki defaults to FSRS on new profiles.

**Decision:** don't implement FSRS now, but make the schema FSRS-shaped so it
can be swapped in without a migration:

```sql
create table if not exists public.cns_user_question_state (
  user_id uuid references public.users(id) on delete cascade,
  question_id uuid references public.cns_questions(id) on delete cascade,
  -- FSRS memory model. v1 only writes reps/lapses/last_reviewed and schedules
  -- with a simple Leitner ladder; stability/difficulty stay null until the
  -- scheduler is upgraded. No migration needed at that point.
  stability numeric,
  difficulty numeric,
  reps int not null default 0,
  lapses int not null default 0,
  last_reviewed_at timestamptz,
  due_at timestamptz,
  primary key (user_id, question_id)
);
```

v1 scheduler: correct → push out one rung (1d, 3d, 7d, 21d, 60d); wrong → back
to rung 1. That alone powers **"Review due today"** and **weak-topic sets**,
which is where nearly all the learner value is.

### 1.3 Remaining work

- `/progress` — attempt history, mastery per topic, accuracy trend
- Bookmarks (`cns_bookmarks` exists, unused)
- Auto-generated weak-topic sets from `cns_user_topic_progress`
- Daily question + streak (extend HUB's existing `login_streak`, don't reinvent)
- Admin authoring UI + JSON/CSV importer (`cns_import_batches` exists, unused)

---

## 2. LMS

Staff-authored, free to start, paid path pre-wired.

### 2.1 Data model

`cns_courses` → `cns_course_modules` → `cns_lessons`, plus `cns_enrollments`
and `cns_lesson_progress`. Content is Tiptap JSON — **Tiptap is already a
dependency in HUB and completely unused**, so the editor is free.

`access_type` / `marketplace_listing_id` ship now, defaulting to `'free'`. They
cost nothing today and mean paid courses later need no migration — they inherit
the same unlock mechanism as paid question banks.

### 2.2 Video

`video_url` + `video_provider` (`youtube` | `vimeo` | `r2`). **Start with
unlisted embeds.** Self-hosting means transcoding, adaptive bitrate and egress
cost — a project, not a field. `is_preview` marks lessons watchable before
enrolling.

### 2.3 The differentiator: CE / CPD hours

An LMS is a nice-to-have. A **documented CPD record** is a professional
necessity, and it only works because UNN verifies identity.

```sql
alter table cns_courses  add column cpd_hours numeric(4,2);
-- issued on completion, immutable, independently verifiable
create table cns_cpd_records (
  id uuid primary key,
  user_id uuid references public.users(id),
  course_id uuid references public.cns_courses(id),
  hours numeric(4,2) not null,
  issued_at timestamptz not null default now(),
  certificate_no text unique not null,   -- human-quotable, e.g. UNN-CPD-2026-0001
  verification_token text unique not null -- powers a public /verify/<token> page
);
```

The public verification page is the point: an employer or council can confirm a
certificate without an account. That's what makes it trustworthy rather than
decorative. Certificate PDF via `pdf-lib` (proven in HUB's marketplace).

**Cross-module win:** end-of-module quizzes reuse the question bank. One quiz
engine, not two.

### 2.4 Interop — deliberately deferred

SCORM and xAPI exist for LMS↔LMS content portability. Both are heavy, and
neither matters until an institution demands it. Note it, skip it.

---

## 3. Resume Builder

### 3.1 The core insight

Every competitor starts with a blank page. **UNN already holds structured
`education`, `experience`, `skills`, `languages` and `certificates` on
`public.profiles`.** So the first render is generated, not typed — the resume is
a *view* of the profile the member already maintains.

Data lives in a CNS-owned `cns_resumes` table seeded *from* `public.profiles`.
CNS reads that table and **never writes it** (isolation rule). Edits diverge into
the resume; a "push back to profile?" prompt is a later nicety.

### 3.2 ATS-safe is a hard constraint, not a style preference

This is where most resume builders quietly fail their users. Verified behaviour
of real parsers:

| Breaks parsing | Why |
|---|---|
| **Two-column layouts** | Parser reads left column then right, interleaving unrelated text — "Senior Engineer \| References available upon" |
| **Tables** | Cell content extracted out of document order |
| **Text boxes** | Treated as floating objects and ignored **entirely** |
| **Graphics, photos, icons** | Not machine-readable |
| **Decorative fonts** | Ligatures extract as garbage, breaking words like "efficient" |
| **`'23 – Present`** | Some parsers read the apostrophe as a stray character |

**Design rules, enforced by the renderer rather than left to the user:**

- Single column. No tables, no text boxes, no images in the ATS template.
- Fonts restricted to Arial, Calibri, Georgia, Helvetica, Times New Roman, Verdana.
- 11–12pt body, 14–16pt section headings, 18–22pt name.
- Full four-digit years, `2023 – Present`.
- Standard section headings ("Work Experience", not "My Journey").

Offer exactly two templates: **ATS-Safe** (default) and **Designed** (for
human-read / PDF sharing), and label them honestly. Also emit **DOCX**, which
parses more reliably than PDF — PDF text-layer order can differ from visual
order, scrambling extraction.

### 3.3 Nursing-specific sections generic builders lack

Registration/licence number and council, clinical rotations, specialties,
shift preferences, and — the differentiator — the **UNN verification badge
plus a `/verify/<token>` link rendered on the document**. A CV that proves the
nurse is real is something Zety structurally cannot offer.

### 3.4 Schema

```sql
create table cns_resumes (
  id uuid primary key,
  user_id uuid references public.users(id) on delete cascade,
  title text not null,                  -- "ICU — UK applications"
  template text not null default 'ats', -- 'ats' | 'designed'
  -- Full document as structured JSON, NOT rendered HTML: it must stay
  -- queryable, diffable against the profile, and re-renderable into any
  -- template or format.
  content jsonb not null,
  is_default boolean not null default false,
  public_token text unique,             -- null = not shared
  updated_at timestamptz default now()
);
```

---

## 4. Jobs Portal

### 4.1 Employers are organisations, not user accounts

HUB's `users.role` is a CHECK constraint; adding `employer` would mean altering
a HUB table (forbidden) *and* would make hospitals appear as people in HUB's
feed and messaging. So `cns_employers` + `cns_employer_members`, exactly how
`units.sql` already models units. A recruiter signs in as an ordinary UNN
member; the employer capability is CNS data. **Zero change to `public.users`.**

### 4.2 The growth lever: Google for Jobs

A job board with no candidates is worthless, and paid acquisition is brutal.
**`schema.org/JobPosting` JSON-LD gets listings into Google's jobs experience
for free.** This is the single highest-leverage thing in the whole module and it
constrains the schema, so it belongs in the design rather than being bolted on.

**Required** — a listing without all five is not eligible:

| Property | Note |
|---|---|
| `title` | Job title only. No codes, locations, salaries or company names. |
| `description` | **HTML**, complete — responsibilities, qualifications, skills. Must not merely repeat the title. |
| `datePosted` | ISO 8601 |
| `hiringOrganization` | Name (+ `sameAs`, logo). `"confidential"` is a supported value. |
| `jobLocation` | `PostalAddress` incl. `addressCountry`. Not required if `applicantLocationRequirements` is set. |

**Recommended, and worth having:** `baseSalary` (`MonetaryAmount`, `unitText`
∈ HOUR/DAY/WEEK/MONTH/YEAR), `employmentType`, `validThrough`, `identifier`,
`jobLocationType: TELECOMMUTE` + `applicantLocationRequirements` for remote, and
`directApply`.

**`directApply` is genuinely ours to claim** — CNS's one-tap apply with an
existing profile is exactly the frictionless flow it denotes.

**Two rules that will bite if ignored:**

1. **Stale jobs are penalised.** Missing `validThrough` is treated as a quality
   signal against the listing, and a site full of undated stale jobs can receive
   a manual action that removes **every** job it has. So expiry is not a
   nice-to-have: `application_deadline` maps to `validThrough`, and a daily
   cron must close expired postings and drop their markup.
2. **Markup must match the visible page.** Title, description, location and
   salary in the JSON-LD must equal what a human sees, or it earns a manual
   action. Render both from one source — never hand-maintain the JSON-LD.

**Schema mapping.** Our internal `employment_type` must map to Google's
vocabulary, so store both:

| CNS | schema.org |
|---|---|
| `full_time` | `FULL_TIME` |
| `part_time` | `PART_TIME` |
| `contract` | `CONTRACTOR` |
| `locum` | `PER_DIEM` |
| `internship` | `INTERN` |
| `volunteer` | `VOLUNTEER` |

**Public pages.** Job detail pages must be crawlable — i.e. **outside CNS's
members-only gate**. This is the first legitimate exception to the fail-closed
middleware: `/jobs/[slug]` is public and indexable, while applying requires a
session. That is also good funnel design (Google → job page → sign in to apply).

### 4.3 Applications

Snapshot the profile **at apply time**. Otherwise a later profile edit
retroactively rewrites what the employer reviewed, and there's no record of what
was actually submitted.

**What the snapshot contains — and must not.** Include name, title, bio,
country, photo, **verification status**, education, experience, skills,
languages, certificates. **Exclude email, phone, date of birth and address.**
Contact details are released only when the employer moves the application to
`shortlisted`, at which point the applicant is notified. This keeps CNS almost
entirely out of the PII business — chosen deliberately, and the snapshot must
not quietly undo it.

Pipeline: `submitted → viewed → shortlisted → interview → offered → rejected`,
plus `withdrawn`. Employers may update status and their private note; never the
snapshot.

---

## 5. Cross-cutting

| Concern | Decision |
|---|---|
| **Search** | Postgres FTS (`to_tsvector` GIN), already indexed on questions and mirroring HUB's `marketplace_search_fts.sql`. No external search service until relevance genuinely suffers — it won't at this scale. |
| **Cache** | Upstash Redis is available. Cache only expensive read-mostly aggregates (browse trees, item stats). Never cache anything entitlement- or answer-related. |
| **Realtime** | Supabase Realtime for the few places that need it — employer application inbox, notification bell. **Not** the attempt runner: it is single-user, and per-change server-action writes already give durability without a socket. |
| **Media** | R2 under a `cns/` key prefix, scoped token. `R2_DIGITAL_BUCKET` stays HUB-only. |
| **Background work** | Vercel cron in `vercel.json`. Needed: expire jobs (daily — see 4.2), expire abandoned attempts, recompute due-for-review. |
| **Notifications** | Insert into `public.notifications` directly (its `notification_type` is free-form text with no CHECK, and INSERT is already permitted). CNS does **not** copy HUB's `notify.ts` fan-out — that would hand it Resend and Firebase credentials. In-app only; if email is needed later, call a HUB endpoint so there stays exactly one Resend caller. |
| **Rate limiting** | Reuse HUB's `lib/ratelimit.ts` pattern on apply, submit and import. |
| **Observability** | `/api/health` reports commit + env. Add structured logs on grading and apply — the two paths where silent failure is most costly. |
| **CI** | HUB has **no build CI at all**. With two apps that's now a real gap: `npm ci && next build` on PRs for both repos. |

---

## 6. Build order

1. **Question bank depth** — `/progress`, bookmarks, weak-topic sets, admin authoring + importer.
2. **Resume builder** — small, high perceived value, and it's the bridge into jobs.
3. **Jobs** — employer onboarding + approval → posting + public indexable pages + JSON-LD → apply pipeline.
4. **LMS** — courses/lessons/progress, then CPD records and certificate verification.

Resume before jobs is deliberate: applications are far more compelling when
there's already a document to attach, and the resume is useful on its own if
jobs slips.

---

## Sources

- [Google — JobPosting structured data](https://developers.google.com/search/docs/appearance/structured-data/job-posting)
- [FSRS vs SM-2 comparison](https://deckstudy.com/blog/fsrs-vs-sm2-modern-spaced-repetition)
- [FSRS algorithm background](https://fluentcards.org/blog/fsrs-spaced-repetition-algorithm/)
- [Jobscan — why tables and columns break ATS parsing](https://www.jobscan.co/blog/resume-tables-columns-ats/)
- [ATS resume formatting rules](https://www.resumeadapter.com/blog/ats-resume-formatting-rules-2026)

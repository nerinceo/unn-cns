-- ===========================================================================
-- CNS — Resume builder.
--
-- Purely additive. One table plus RLS. Reads public.users / public.profiles to
-- pre-fill a new resume, never writes them.
--
-- WHY THE RESUME OWNS ITS OWN DOCUMENT RATHER THAN MIRRORING THE PROFILE
--
-- Measured on production before designing this: of 96 profiles, education and
-- experience are populated in 2, and skills/certificates/languages in 0 —
-- while professional_title (78), bio (76) and country (69) are mostly filled.
-- And profiles.experience is only {id, title, employer}: no dates, no
-- achievements, which is too thin to render a CV from.
--
-- Two consequences:
--   1. This cannot be a "generate from your profile" feature. It is a real
--      editor that PRE-FILLS whatever exists. In practice the resume builder
--      becomes the reason a member finally completes their profile, not the
--      other way round.
--   2. `content` is a richer superset of the profile and diverges from it by
--      design. Syncing back would lose data, so it is deliberately one-way.
--
-- `content` is structured JSON, never rendered HTML — it must stay queryable,
-- re-renderable into any template, and exportable to PDF/DOCX. See the shape
-- documented below and mirrored in lib/cns/resume.ts.
--
-- Run manually in Supabase Dashboard > SQL Editor. Safe to re-run.
-- ===========================================================================

create table if not exists public.cns_resumes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  title text not null default 'My Resume',      -- "ICU — UK applications"

  -- 'ats'      single column, no tables/boxes/graphics. The default, because
  --            multi-column layouts and tables are silently destroyed by
  --            applicant tracking systems.
  -- 'designed' for human reading / direct sharing only.
  template text not null default 'ats'
    check (template in ('ats','designed')),

  /*
    content shape (see ResumeContent in lib/cns/resume.ts):
    {
      header:        { full_name, headline, email, phone, location, links:[{label,url}] },
      summary:       "text",
      registration:  [{ council, number, country, expires }],   -- nursing-specific
      experience:    [{ title, employer, location, start, end, current, bullets:[] }],
      education:     [{ degree, field, institution, location, start, end, grade }],
      certifications:[{ name, issuer, year, credential_id }],
      skills:        ["..."],
      specialties:   ["ICU","Paediatrics"],
      languages:     [{ name, level }],
      section_order: ["summary","experience",...]               -- user reordering
    }
  */
  content jsonb not null default '{}'::jsonb,

  is_default boolean not null default false,

  -- Non-null = shareable at /r/<token> WITHOUT a login, so a recruiter can open
  -- it. Random and revocable; null means private. Never the resume id, which
  -- would make every resume guessable from any other.
  public_token text unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cns_resumes_user_idx
  on public.cns_resumes(user_id, updated_at desc);
create index if not exists cns_resumes_token_idx
  on public.cns_resumes(public_token) where public_token is not null;

-- One default per member, enforced in the database rather than hoped for in
-- application code.
create unique index if not exists cns_resumes_one_default_idx
  on public.cns_resumes(user_id) where is_default;

-- ---------------------------------------------------------------------------
-- RLS: strictly own-row.
--
-- Note there is deliberately NO policy granting anonymous read by token. A
-- public link is served by a SECURITY DEFINER function (below) so that sharing
-- exposes exactly one resume — never a table anon can probe.
-- ---------------------------------------------------------------------------
alter table public.cns_resumes enable row level security;

drop policy if exists "cns own resumes" on public.cns_resumes;
create policy "cns own resumes"
  on public.cns_resumes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Public share.
--
-- Returns one resume by token, plus the author's verification status — the
-- point of hosting this on UNN rather than exporting a PDF is that the reader
-- can see the nurse is verified.
--
-- Deliberately returns no email/phone beyond what the member put in `content`
-- themselves, and nothing at all for an unknown or revoked token.
-- ---------------------------------------------------------------------------
create or replace function public.cns_public_resume(p_token text)
returns table (
  title text,
  template text,
  content jsonb,
  author_name text,
  author_photo text,
  verification_status text,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select r.title, r.template, r.content,
         u.full_name, u.profile_photo, u.verification_status, r.updated_at
    from public.cns_resumes r
    join public.users u on u.id = r.user_id
   where r.public_token = p_token
     and p_token is not null
     and length(p_token) >= 16;   -- refuse to match a trivially short token
$$;

revoke all on function public.cns_public_resume(text) from public;
grant execute on function public.cns_public_resume(text) to anon, authenticated;

# Files mirrored from UNN Hub

CNS is a **separate repo** from `unn-platform`, deliberately: a CNS commit must
never be able to break HUB's production build. The cost of that isolation is
that a small set of files exists in both repos and can drift.

This file is the manifest. **If you change one of these in either repo, change
it in both**, and update the SHA below.

Copied from `unn-platform` at commit **`e63d766`** (2026-09-20).

| CNS path | HUB origin | Notes |
|---|---|---|
| `lib/auth/cookie-config.ts` | `lib/auth/cookie-config.ts` | **Most critical.** See below. |
| `lib/access.ts` | `lib/access.ts` | Account scope + `resolveHome()`. Drift lands people in the WRONG APP — it does not throw, it just silently misroutes. |
| `lib/sanitize.ts` | `lib/sanitize.ts` | Rich-text allowlist. Must match what the Tiptap editor emits. |
| `lib/lms/index.ts` | partial | LMS doc types + expertise vocabularies are duplicated, not shared. |
| `lib/supabase/client.ts` | `lib/supabase/client.ts` | Browser client + host-only cookie dedupe |
| `lib/supabase/server.ts` | `lib/supabase/server.ts` | `getCurrentUser`, `getCurrentUserProfile` |
| `lib/supabase/admin.ts` | `lib/supabase/admin.ts` | Service role. Server-only. |
| `lib/users/columns.ts` | `lib/users/columns.ts` | The `public.users` column allowlist. Must match the grant in HUB migration 0024 *and* both sibling copies — a column named here but not granted errors the whole query with `42501`, which took CNS down when 0024 first ran. |
| `lib/utils/cn.ts` | `lib/utils/cn.ts` | Never changes |
| `components/ui/button.tsx` | same | |
| `components/ui/input.tsx` | same | |
| `components/ui/badge.tsx` | same | |
| `components/ui/avatar.tsx` | same | |
| `components/ui/tabs.tsx` | same | |
| `components/ui/textarea.tsx` | same | |
| `tailwind.config.ts` | same | Palette is hardcoded hex, not CSS variables — a rebrand means editing both |
| `app/globals.css` | `app/globals.css` | The `.dark .bg-white { … !important }` block is load-bearing for dark mode |

## Why the auth cookie files matter more than the rest

The two apps share **one session**. That works because both write the Supabase
auth cookies with `domain=.nerusalem.com`, so the browser sends them to
`unn.nerusalem.com` and `cns.nerusalem.com` alike.

(This previously read `.unnhub.org` / `app.unnhub.org` / `cns.unnhub.org`. Those
hosts are retired — `cns.unnhub.org` 404s and `app.unnhub.org` only redirects —
and that domain cannot hold a session at all.)

If the cookie handling diverges — different domain, different `maxAge`, one app
omitting the domain — then a token rotation performed in one app writes cookies
the other cannot read. Supabase's refresh-token reuse detection then revokes the
whole family and the user is signed out of **both** apps, intermittently, with
no obvious cause.

The mitigating design: the value that actually matters is not in this code at
all. It is the `NEXT_PUBLIC_COOKIE_DOMAIN` **environment variable**, set once
per environment in Vercel and read by both apps. Copies of the reading code
cannot drift on the one thing that would break a session.

## What is deliberately NOT shared

- **`types/index.ts`** — 748 lines of marketplace/units/events types. CNS keeps
  its own minimal set.
- **`lib/actions/notify.ts`** — fans out to Resend *and* Firebase. Copying it
  would hand CNS the credentials to email or push the entire member base. CNS
  writes notification rows only; if it ever needs email, it calls a HUB endpoint.
- **`components/platform/*`** (90 files) — HUB-specific.
- **Everything Stripe, R2-digital, messaging, units, capsee, nubo, rewards.**
  CNS holds no Stripe key and cannot reach the paid-content bucket.

## Checking for drift

```bash
npm run check:drift                                  # assumes ../unn-platform
HUB_REPO_PATH=/path/to/unn-platform npm run check:drift
```

`scripts/check-hub-drift.mjs` covers **all 13 files** in the table above and
exits non-zero on drift, so it can gate a pre-push hook. It replaces the hand
loop that used to live here, which checked only 7 of them — every
`components/ui/*` file was unwatched.

Two details the hand loop got wrong, both of which made it report false drift
on every single run:

- **Line endings are normalised before comparing.** The two repos are checked
  out with different `autocrlf` settings: HUB's working tree is CRLF, CNS's is
  LF. A raw `diff` therefore reports all 13 files as completely rewritten, and
  a check that always fails is a check nobody reads.
- **`app/globals.css` is compared as a prefix, not for equality.** CNS
  legitimately appends an ~80-line `.resume-doc` block for the ATS-parseable
  resume document. The check asserts HUB's content appears verbatim at the top,
  which still catches an edit to any shared rule — including the load-bearing
  `.dark .bg-white { … !important }` block — while permitting the appendix.

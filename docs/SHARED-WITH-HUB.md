# Files mirrored from UNN Hub

CNS is a **separate repo** from `unn-platform`, deliberately: a CNS commit must
never be able to break HUB's production build. The cost of that isolation is
that a small set of files exists in both repos and can drift.

This file is the manifest. **If you change one of these in either repo, change
it in both**, and update the SHA below.

Copied from `unn-platform` at commit **`56e0ed7`** (2026-07-21).

| CNS path | HUB origin | Notes |
|---|---|---|
| `lib/auth/cookie-config.ts` | `lib/auth/cookie-config.ts` | **Most critical.** See below. |
| `lib/supabase/client.ts` | `lib/supabase/client.ts` | Browser client + host-only cookie dedupe |
| `lib/supabase/server.ts` | `lib/supabase/server.ts` | `getCurrentUser`, `getCurrentUserProfile` |
| `lib/supabase/admin.ts` | `lib/supabase/admin.ts` | Service role. Server-only. |
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
auth cookies with `domain=.unnhub.org`, so the browser sends them to
`app.unnhub.org` and `cns.unnhub.org` alike.

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

There is no automated check yet. Until there is, diff by hand against a local
HUB checkout:

```bash
for f in lib/auth/cookie-config.ts lib/supabase/client.ts lib/supabase/server.ts \
         lib/supabase/admin.ts lib/utils/cn.ts tailwind.config.ts app/globals.css; do
  diff -q "$f" "../unn-platform/$f" || echo "DRIFT: $f"
done
```

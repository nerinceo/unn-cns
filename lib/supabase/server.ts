import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import {
  REMEMBER_ME_COOKIE,
  withAuthCookieOptions,
} from "@/lib/auth/cookie-config";

// Per-request memoization: React's cache() dedupes within a single render,
// so calling createClient()/getCurrentUser()/getCurrentUserProfile() many
// times across layout + page + server-component children only hits the
// work once. Safe across requests because cache() scope is request-local.

export const createClient = cache(async () => {
  const cookieStore = await cookies();
  const remember = cookieStore.get(REMEMBER_ME_COOKIE)?.value === "1";

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(
                name,
                value,
                withAuthCookieOptions(options, remember)
              );
            });
          } catch {
            // Server Component — cookies can be read but not written
          }
        },
      },
    }
  );
});

/**
 * Authenticated user for the current request. Dedupes the auth lookup across
 * layout/page/component tree. Returns null if not logged in.
 *
 * Uses getClaims() instead of getUser() — getClaims() verifies the JWT
 * locally against the project's JWKS (no network round-trip) when asymmetric
 * signing keys are enabled. Same path the middleware uses. Saves ~50ms per
 * server-rendered page for users outside us-east, which was the single
 * biggest tax on first-load latency.
 *
 * If the project is still on the legacy HS256 secret, supabase-js
 * transparently falls back to a network call — i.e. identical behavior to
 * the old getUser() path, no regression.
 *
 * Returns a minimal user-like shape (id, email) — those are the only fields
 * any caller in this codebase reads from getCurrentUser(). Full profile
 * fields come from getCurrentUserProfile() which reads the users table.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return {
    id: claims.sub as string,
    email: (claims.email as string | undefined) ?? "",
  };
});

/**
 * Full `users` row for the current session. Useful wherever layouts, headers,
 * and pages each re-fetch the same profile. Returns null if unauthenticated
 * or if the row hasn't been provisioned yet.
 */
export const getCurrentUserProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return data;
});

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The signed-in user's own contact fields.
 *
 * 0024 (HUB repo owns the migration) dropped `phone`, `address` and
 * `date_of_birth` from the anon/authenticated column grant on public.users.
 * Column grants are NOT row-aware, so the user-scoped client can no longer read
 * these even from the caller's own row — naming them ERRORS the whole query
 * rather than returning null, which is why every own-data read had to move
 * here. Service-role read, hard-scoped to the caller's own id.
 *
 * Never widen this to accept a user id parameter. The whole guarantee is that
 * the id comes from the session and nowhere else.
 *
 * Mirrors getOwnContactInfo() in the HUB repo (lib/actions/account.ts).
 */
export async function getOwnContactInfo(): Promise<{
  phone: string | null;
  address: string | null;
  date_of_birth: string | null;
}> {
  const empty = { phone: null, address: null, date_of_birth: null };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub as string | undefined;
  if (!uid) return empty;

  const { data } = await createAdminClient()
    .from("users")
    .select("phone, address, date_of_birth")
    .eq("id", uid)
    .maybeSingle();
  if (!data) return empty;

  return {
    phone: (data.phone as string | null) ?? null,
    address: (data.address as string | null) ?? null,
    date_of_birth: (data.date_of_birth as string | null) ?? null,
  };
}

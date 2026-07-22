import "server-only";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/**
 * Platform staff check.
 *
 * Mirrors the roles HUB uses. This is a convenience for rendering — it is NOT
 * the security boundary. Every staff-only write is independently enforced by
 * RLS or by a SECURITY DEFINER function that re-checks via cns_is_staff(), so
 * hiding a button here is presentation, not protection.
 */
export async function isStaff(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return ["platform_admin", "platform_moderator"].includes((data?.role as string) ?? "");
}

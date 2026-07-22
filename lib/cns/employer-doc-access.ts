import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reading an employer's verification document key.
 *
 * `cns_employers.registration_doc_key` is not selectable by anon or
 * authenticated — see supabase/migrations/cns_employer_doc_privacy.sql. RLS on
 * that table deliberately lets any signed-in user read an organisation's
 * public profile, so leaving the key on the same row with the same privileges
 * exposed every business registration document on the platform.
 *
 * Everything that needs the key goes through here: check entitlement in the
 * database, then read with service role. One path, so there is one place to
 * get it wrong rather than four.
 */

export async function canReadEmployerDoc(employerId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("cns_can_read_employer_doc", {
    p_employer_id: employerId,
  });
  if (!error) return Boolean(data);

  // The migration adding that function may not have been applied yet — it has
  // happened on this project before, and a missing function must not decide a
  // security question by accident in either direction. Fall back to asking the
  // same question directly: an approved membership row, or staff.
  //
  // Both reads are the user's own client, so RLS still applies; the membership
  // policy lets a user see their own row, which is exactly what is needed.
  const { data: membership } = await supabase
    .from("cns_employer_members")
    .select("id")
    .eq("employer_id", employerId)
    .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .eq("status", "approved")
    .maybeSingle();
  if (membership) return true;

  const { data: staff } = await supabase.rpc("cns_is_staff");
  return Boolean(staff);
}

export async function readEmployerDocKey(employerId: string): Promise<string | null> {
  if (!(await canReadEmployerDoc(employerId))) return null;

  const { data } = await createAdminClient()
    .from("cns_employers")
    .select("registration_doc_key")
    .eq("id", employerId)
    .maybeSingle();

  return (data?.registration_doc_key as string | null) ?? null;
}

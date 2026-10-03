import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReadEmployerDoc } from "@/lib/cns/employer-doc-access";

/**
 * An employer's PRIVATE fields — contact details, legal name, staff review
 * note — for its own approved members and platform staff only.
 *
 * These columns are no longer granted to anon/authenticated (migration 0064
 * section 9, E-B-001): an approved employer's row is publicly readable, and
 * the blanket column grant handed its email, phone, contact person, legal name,
 * address and the staff's review note to anyone with the anon key. Column
 * grants cannot be row-aware, so entitled readers come through here instead:
 * the membership check first, then a service-role read of one row.
 */
export interface EmployerPrivate {
  email: string | null;
  phone: string | null;
  business_email: string | null;
  contact_person: string | null;
  legal_name: string | null;
  address: string | null;
  review_note: string | null;
}

export async function getEmployerPrivate(employerId: string): Promise<EmployerPrivate | null> {
  if (!(await canReadEmployerDoc(employerId))) return null;
  const { data } = await createAdminClient()
    .from("cns_employers")
    .select("email,phone,business_email,contact_person,legal_name,address,review_note")
    .eq("id", employerId)
    .maybeSingle();
  return (data as EmployerPrivate | null) ?? null;
}

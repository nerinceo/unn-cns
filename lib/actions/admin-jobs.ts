"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff review of employer organisations.
 *
 * Authorisation is NOT checked here — the RLS policy on cns_employers only
 * permits UPDATE to approved members of that employer or to cns_is_staff().
 * A non-staff caller's update simply affects zero rows.
 */
export async function reviewEmployer(
  employerId: string,
  decision: "approved" | "rejected" | "suspended",
  note?: string
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cns_employers")
    .update({
      status: decision,
      review_note: note ?? null,
      // Approving the organisation also marks it verified — for a hospital the
      // two decisions are the same act, unlike nurse verification which checks
      // a licence separately.
      ...(decision === "approved" ? { verification_status: "verified" } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", employerId)
    .select("id,name,created_by");

  if (error) return { error: error.message };
  if (!data?.length) return { error: "Not permitted, or employer not found." };

  // Tell the person who registered. notification_type is free-form text with no
  // CHECK constraint, and INSERT is already permitted, so this needs no DDL
  // change to HUB. In-app only — CNS holds no email or push credentials.
  const employer = data[0];
  if (employer.created_by) {
    await supabase.from("notifications").insert({
      user_id: employer.created_by,
      notification_type: `cns_employer_${decision}`,
      message:
        decision === "approved"
          ? `${employer.name} has been approved. You can now publish nursing roles.`
          : `${employer.name} was not approved.${note ? ` ${note}` : ""}`,
      reference_id: employer.id,
    });
  }

  revalidatePath("/admin/employers");
  revalidatePath("/employer");
  return { ok: true };
}

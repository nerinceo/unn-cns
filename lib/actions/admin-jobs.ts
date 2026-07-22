"use server";


import type { ActionResult } from "@/lib/actions/result";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

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
): Promise<ActionResult> {
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

/* ------------------------------- job review -------------------------------- */

type JobDecision = "active" | "rejected" | "changes_requested" | "paused" | "removed";

/**
 * Staff decision on a submitted job (blueprint §9.2).
 *
 * Every job passes through here — §3 is explicit that only approved jobs
 * become publicly visible. Rejection, change-requests and removal all REQUIRE
 * a reason: §9.2 says so, and an employer told only "rejected" cannot fix
 * anything, which turns one moderation action into a support conversation.
 *
 * Authorisation is not checked here. The RLS policy on cns_jobs permits UPDATE
 * only to employer members or cns_is_staff(), so a non-staff caller's update
 * affects zero rows and the guard below reports it.
 */
export async function reviewJob(jobId: string, decision: JobDecision, reason?: string): Promise<ActionResult> {
  const supabase = await createClient();

  if (decision !== "active" && !reason?.trim()) {
    return { error: "A reason is required so the employer knows what to change." };
  }

  const { data: job } = await supabase
    .from("cns_jobs")
    .select("id,title,employer_id,slug")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { error: "Job not found" };

  const { data, error } = await supabase
    .from("cns_jobs")
    .update({
      status: decision,
      changes_requested_note: decision === "changes_requested" ? reason : null,
      closed_reason: decision === "rejected" || decision === "removed" ? reason : null,
      published_at: decision === "active" ? new Date().toISOString() : null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .select("id");

  if (error) return { error: error.message };
  if (!data?.length) return { error: "Not permitted." };

  // Append-only, written through a definer function so it cannot be edited or
  // erased through the API — including by staff.
  await supabase.rpc("cns_write_audit", {
    p_action: `job.${decision}`,
    p_target_type: "job",
    p_target_id: jobId,
    p_reason: reason ?? null,
    p_metadata: { title: job.title },
  });

  // Tell the employer's approved members what happened and why.
  const { data: members } = await supabase
    .from("cns_employer_members")
    .select("user_id")
    .eq("employer_id", job.employer_id as string)
    .eq("status", "approved");

  const message =
    decision === "active"
      ? `"${job.title}" is approved and now live on the job board.`
      : decision === "changes_requested"
        ? `"${job.title}" needs changes before it can go live. ${reason}`
        : decision === "rejected"
          ? `"${job.title}" was not approved. ${reason}`
          : decision === "paused"
            ? `"${job.title}" has been paused by UNN. ${reason}`
            : `"${job.title}" has been removed. ${reason}`;

  if (members?.length) {
    await supabase.from("notifications").insert(
      members.map((m) => ({
        user_id: m.user_id,
        notification_type: `cns_job_${decision}`,
        message,
        reference_id: jobId,
      }))
    );
  }

  revalidatePath("/admin/jobs");
  revalidatePath("/jobs");
  return { ok: true };
}

/* --------------------------------- reports --------------------------------- */

export async function resolveReport(
  reportId: string,
  status: "reviewing" | "resolved" | "dismissed",
  note?: string
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cns_job_reports")
    .update({
      status,
      resolution_note: note ?? null,
      resolved_by: user?.id ?? null,
      resolved_at: status === "resolved" || status === "dismissed" ? new Date().toISOString() : null,
    })
    .eq("id", reportId)
    .select("id");

  if (error) return { error: error.message };
  if (!data?.length) return { error: "Not permitted." };

  await supabase.rpc("cns_write_audit", {
    p_action: `report.${status}`,
    p_target_type: "report",
    p_target_id: reportId,
    p_reason: note ?? null,
  });

  revalidatePath("/admin/reports");
  return { ok: true };
}

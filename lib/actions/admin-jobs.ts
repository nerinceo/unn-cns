"use server";


import type { ActionResult } from "@/lib/actions/result";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { actionError, logError } from "@/lib/errors";
import { LIMITS, all, optText, reqId, reqOneOf } from "@/lib/validate";
import { deadlinePassed } from "@/lib/cns/job-constants";
import { reviewablePending } from "@/lib/cns/job-live-edit";

const EMPLOYER_DECISIONS = ["approved", "rejected", "suspended"] as const;
const JOB_DECISIONS = ["active", "rejected", "changes_requested", "paused", "removed"] as const;
const REPORT_STATUSES = ["reviewing", "resolved", "dismissed"] as const;

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
  const v = all({
    employerId: reqId(employerId, "Employer"),
    decision: reqOneOf(decision, "Decision", EMPLOYER_DECISIONS),
    note: optText(note, "Note", LIMITS.comment, { multiline: true }),
  });
  if (!v.ok) return { error: v.error };
  employerId = v.value.employerId;
  decision = v.value.decision;
  note = v.value.note ?? undefined;
  // The organisation is told why; a bare "not approved" left them nothing to fix.
  if (decision !== "approved" && !note) {
    return { error: "A reason is required — it is sent to the organisation." };
  }

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

  if (error) return actionError("admin-jobs:reviewEmployer", error);
  if (!data?.length) return { error: "Not permitted, or employer not found." };

  // Tell the person who registered. notification_type is free-form text with no
  // CHECK constraint, and INSERT is already permitted, so this needs no DDL
  // change to HUB. In-app only — CNS holds no email or push credentials.
  const employer = data[0];
  if (employer.created_by) {
    const { error: notifyError } = await createAdminClient().from("notifications").insert({
      user_id: employer.created_by,
      notification_type: `cns_employer_${decision}`,
      message:
        decision === "approved"
          ? `${employer.name} has been approved. You can now publish nursing roles.`
          : decision === "suspended"
            ? `${employer.name} has been suspended. ${note}`
            : `${employer.name} was not approved. ${note}`,
      reference_id: employer.id,
    });
    if (notifyError) logError("admin-jobs:reviewEmployer:notify", notifyError, { employerId });
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
  const v = all({
    jobId: reqId(jobId, "Job"),
    decision: reqOneOf(decision, "Decision", JOB_DECISIONS),
    reason: optText(reason, "Reason", LIMITS.comment, { multiline: true }),
  });
  if (!v.ok) return { error: v.error };
  jobId = v.value.jobId;
  decision = v.value.decision;
  reason = v.value.reason ?? undefined;

  if (decision !== "active" && !reason) {
    return { error: "A reason is required so the employer knows what to change." };
  }

  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("cns_jobs")
    .select("id,title,employer_id,slug,application_deadline")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) logError("admin-jobs:reviewJob:job", jobError, { jobId });
  if (!job) return { error: "Job not found" };
  // Approving a role whose deadline has passed lists it as "closed" on the
  // board the moment it goes live. Ask for changes instead.
  if (decision === "active" && deadlinePassed(job.application_deadline as string | null)) {
    return { error: "This role's application deadline has passed. Request changes so the employer can set a new date." };
  }

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

  if (error) return actionError("admin-jobs:reviewJob", error, undefined, { jobId });
  if (!data?.length) return { error: "Not permitted." };

  // Append-only, written through a definer function so it cannot be edited or
  // erased through the API — including by staff.
  const { error: auditError } = await supabase.rpc("cns_write_audit", {
    p_action: `job.${decision}`,
    p_target_type: "job",
    p_target_id: jobId,
    p_reason: reason ?? null,
    p_metadata: { title: job.title },
  });
  if (auditError) logError("admin-jobs:reviewJob:audit", auditError, { jobId, decision });

  // Tell the employer's approved members what happened and why.
  const { data: members, error: membersError } = await supabase
    .from("cns_employer_members")
    .select("user_id")
    .eq("employer_id", job.employer_id as string)
    .eq("status", "approved");
  if (membersError) logError("admin-jobs:reviewJob:notifyMembers", membersError, { jobId });

  const message =
    decision === "active"
      ? `"${job.title}" is approved and now live on the job board.`
      : decision === "changes_requested"
        ? `"${job.title}" needs changes before it can go live. ${reason}`
        : decision === "rejected"
          ? `"${job.title}" was not approved. ${reason}`
          : decision === "paused"
            ? `"${job.title}" has been paused by Nerusalem. ${reason}`
            : `"${job.title}" has been removed. ${reason}`;

  if (members?.length) {
    const { error: notifyError } = await createAdminClient().from("notifications").insert(
      members.map((m) => ({
        user_id: m.user_id,
        notification_type: `cns_job_${decision}`,
        message,
        reference_id: jobId,
      }))
    );
    if (notifyError) logError("admin-jobs:reviewJob:notify", notifyError, { jobId });
  }

  revalidatePath("/admin/jobs");
  revalidatePath("/jobs");
  return { ok: true };
}

/* ------------------------- changes to live roles --------------------------- */

/**
 * Staff decision on the changes an employer made to a LIVE role.
 *
 * The live listing keeps its approved text while the change waits (see
 * cns_jobs_launch_fixes.sql). Approving applies exactly the reviewable keys —
 * pending_changes is employer-writable, so nothing outside REVIEWED_FIELDS is
 * ever forwarded. Rejecting discards the change and leaves the role live.
 * Authorisation: the update runs as the caller, and only staff pass the guard
 * trigger with content columns changed on a live row.
 */
export async function reviewJobChanges(
  jobId: string,
  decision: "approve" | "reject",
  reason?: string
): Promise<ActionResult> {
  const v = all({
    jobId: reqId(jobId, "Job"),
    decision: reqOneOf(decision, "Decision", ["approve", "reject"] as const),
    reason: optText(reason, "Reason", LIMITS.comment, { multiline: true }),
  });
  if (!v.ok) return { error: v.error };
  if (v.value.decision === "reject" && !v.value.reason) {
    return { error: "A reason is required so the employer knows what to change." };
  }

  const supabase = await createClient();
  const { data: job, error: jobError } = await supabase
    .from("cns_jobs")
    .select("id,title,employer_id,slug,status,salary_min,salary_max,pending_changes")
    .eq("id", v.value.jobId)
    .maybeSingle();
  if (jobError) logError("admin-jobs:reviewJobChanges:job", jobError, { jobId });
  if (!job) return { error: "Job not found" };
  const changes = reviewablePending(job.pending_changes);
  if (!Object.keys(changes).length) return { error: "There are no changes waiting on this role." };

  if (v.value.decision === "approve") {
    const lo = ("salary_min" in changes ? changes.salary_min : job.salary_min) as number | null;
    const hi = ("salary_max" in changes ? changes.salary_max : job.salary_max) as number | null;
    if (lo != null && hi != null && Number(lo) > Number(hi)) {
      return { error: "These changes would leave “Salary from” above “Salary to”. Reject them with a reason." };
    }
  }

  const { data, error } = await supabase
    .from("cns_jobs")
    .update({
      ...(v.value.decision === "approve" ? changes : {}),
      pending_changes: null,
      pending_submitted_at: null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .select("id");
  if (error) return actionError("admin-jobs:reviewJobChanges", error, undefined, { jobId });
  if (!data?.length) return { error: "Not permitted." };

  const { error: auditError } = await supabase.rpc("cns_write_audit", {
    p_action: `job.changes_${v.value.decision === "approve" ? "approved" : "rejected"}`,
    p_target_type: "job",
    p_target_id: job.id,
    p_reason: v.value.reason ?? null,
    p_metadata: { title: job.title, fields: Object.keys(changes) },
  });
  if (auditError) logError("admin-jobs:reviewJobChanges:audit", auditError, { jobId });

  const { data: members, error: membersError } = await createAdminClient()
    .from("cns_employer_members")
    .select("user_id")
    .eq("employer_id", job.employer_id as string)
    .eq("status", "approved");
  if (membersError) logError("admin-jobs:reviewJobChanges:members", membersError, { jobId });
  if (members?.length) {
    const message =
      v.value.decision === "approve"
        ? `Your changes to "${job.title}" are approved and now live.`
        : `Your changes to "${job.title}" were not approved; the role stays live as it was. ${v.value.reason}`;
    const { error: notifyError } = await createAdminClient().from("notifications").insert(
      members.map((m) => ({
        user_id: m.user_id,
        notification_type: `cns_job_changes_${v.value.decision === "approve" ? "approved" : "rejected"}`,
        message,
        reference_id: job.id,
      }))
    );
    if (notifyError) logError("admin-jobs:reviewJobChanges:notify", notifyError, { jobId });
  }

  revalidatePath("/admin/jobs");
  revalidatePath(`/jobs/${job.slug as string}`);
  revalidatePath(`/employer/${job.employer_id as string}`);
  return { ok: true };
}

/* --------------------------------- reports --------------------------------- */

export async function resolveReport(
  reportId: string,
  status: "reviewing" | "resolved" | "dismissed",
  note?: string
): Promise<ActionResult> {
  const v = all({
    reportId: reqId(reportId, "Report"),
    status: reqOneOf(status, "Status", REPORT_STATUSES),
    note: optText(note, "Note", LIMITS.comment, { multiline: true }),
  });
  if (!v.ok) return { error: v.error };
  reportId = v.value.reportId;
  status = v.value.status;
  note = v.value.note ?? undefined;

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

  if (error) return actionError("admin-jobs:resolveReport", error, undefined, { reportId });
  if (!data?.length) return { error: "Not permitted." };

  const { error: auditError } = await supabase.rpc("cns_write_audit", {
    p_action: `report.${status}`,
    p_target_type: "report",
    p_target_id: reportId,
    p_reason: note ?? null,
  });
  if (auditError) logError("admin-jobs:resolveReport:audit", auditError, { reportId, status });

  revalidatePath("/admin/reports");
  return { ok: true };
}

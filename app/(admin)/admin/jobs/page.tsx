import Link from "next/link";
import { Briefcase, MapPin, Building2, Clock, AlertTriangle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getJobLabels } from "@/lib/cns/taxonomy";
import { jobDescriptionHtml, type CnsJob } from "@/lib/cns/jobs";
import { JobReviewActions } from "@/components/jobs/JobReviewActions";
import { JobChangesActions } from "@/components/jobs/JobChangesActions";
import { deadlinePassed } from "@/lib/cns/job-constants";
import { reviewablePending } from "@/lib/cns/job-live-edit";

/** How a field reads in the change review. */
const FIELD_LABEL: Record<string, string> = {
  title: "Title", description: "Description", responsibilities: "Responsibilities",
  qualifications: "Qualifications", employment_type: "Employment type", nursing_role: "Nursing role",
  specialty: "Specialty", work_setting: "Work setting", experience_level: "Experience required",
  is_remote: "Remote", work_mode: "Work mode", country: "Country", state: "State", city: "City",
  street_address: "Street address", postal_code: "Postal code", experience_min_years: "Minimum experience (years)",
  qualification_required: "Qualification required", license_required: "Registration required",
  language_requirements: "Languages", salary_min: "Salary from", salary_max: "Salary to",
  salary_currency: "Currency", salary_period: "Salary period", salary_undisclosed: "Salary hidden",
  salary_text: "Salary text", apply_mode: "Apply mode", external_apply_url: "External apply link",
  visa_sponsorship: "Visa sponsorship",
};

const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);

export const dynamic = "force-dynamic";
export const metadata = { title: "Job approvals — Central Nerusalem Space Admin" };

/**
 * Job review queue (blueprint §9.2).
 *
 * Every job passes through here before it can reach the public board (§3).
 * Service role, because a queue spanning every organisation is exactly what no
 * user-scoped policy would return — the layout has already confirmed staff.
 */
export default async function AdminJobsPage() {
  const admin = createAdminClient();
  const labels = await getJobLabels();

  const { data: rows } = await admin
    .from("cns_jobs")
    .select(
      "id,slug,title,description,responsibilities,qualifications,status,employer_id," +
        "country,state,city,nursing_role,specialty,work_setting,employment_type," +
        "experience_level,is_remote,application_deadline,license_required,vacancies,created_at"
    )
    // Removed, paused, closed and expired roles stay in the history: a removal
    // vanished from this page the moment it was made, leaving staff no trail.
    .in("status", ["submitted", "active", "changes_requested", "rejected", "removed", "paused", "closed", "expired"])
    .order("created_at", { ascending: false })
    .limit(100);

  // Changes employers have made to roles that are already live.
  const { data: changeRows } = await admin
    .from("cns_jobs")
    .select(
      "id,slug,title,description,responsibilities,qualifications,status,employer_id," +
        "country,state,city,nursing_role,specialty,work_setting,employment_type,experience_level," +
        "is_remote,work_mode,street_address,postal_code,experience_min_years,qualification_required," +
        "license_required,language_requirements,salary_min,salary_max,salary_currency,salary_period," +
        "salary_undisclosed,salary_text,apply_mode,external_apply_url,visa_sponsorship," +
        "pending_changes,pending_submitted_at"
    )
    .not("pending_changes", "is", null)
    .in("status", ["active", "paused"])
    .order("pending_submitted_at", { ascending: true });
  const changed = ((changeRows ?? []) as unknown as Record<string, unknown>[])
    .map((row) => ({ row, changes: reviewablePending(row.pending_changes) }))
    .filter((x) => Object.keys(x.changes).length > 0);

  const jobs = (rows ?? []) as unknown as CnsJob[];
  const employerIds = Array.from(
    new Set([...jobs.map((j) => j.employer_id), ...changed.map((c) => c.row.employer_id as string)])
  );
  const { data: employers } = employerIds.length
    ? await admin
        .from("cns_employers")
        .select("id,name,status,verification_status")
        .in("id", employerIds)
    : { data: [] };
  const empById = new Map((employers ?? []).map((e) => [e.id as string, e]));

  const pending = jobs.filter((j) => j.status === "submitted");
  const decided = jobs.filter((j) => j.status !== "submitted");

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <Briefcase className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">Job approvals</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Nothing reaches the public board until it is approved here.
        </p>
        <p className="mt-2 flex max-w-2xl items-start gap-2 rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary" />
          Watch for prohibited claims — guaranteed visas, guaranteed jobs, or any request for
          payment from applicants. Reject those with a reason.
        </p>
      </header>

      {changed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Changes to live roles ({changed.length})
          </h2>
          <p className="mb-3 max-w-2xl text-xs text-muted-foreground">
            These roles are live with their approved text. Approving applies the changes below;
            rejecting keeps the live version.
          </p>
          <ul className="space-y-4">
            {changed.map(({ row, changes }) => (
              <li key={row.id as string} className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium">{row.title as string}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      {empById.get(row.employer_id as string)?.name ?? "Employer"}
                      <Link href={`/jobs/${row.slug as string}`} className="text-xs text-primary hover:underline">
                        View live
                      </Link>
                    </p>
                    <dl className="mt-3 space-y-2 text-sm">
                      {Object.entries(changes).map(([k, next]) => (
                        <div key={k} className="rounded-md border border-border p-2">
                          <dt className="text-xs font-medium text-muted-foreground">{FIELD_LABEL[k] ?? k}</dt>
                          <dd className="mt-1 grid gap-1 sm:grid-cols-2">
                            <span className="whitespace-pre-wrap break-words text-muted-foreground line-through decoration-muted-foreground/50">
                              {show(row[k])}
                            </span>
                            <span className="whitespace-pre-wrap break-words">{show(next)}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <JobChangesActions jobId={row.id as string} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Awaiting review ({pending.length})
        </h2>

        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            Nothing waiting.
          </p>
        ) : (
          <ul className="space-y-4">
            {pending.map((j) => {
              const e = empById.get(j.employer_id);
              const location =
                [j.city, labels.country[j.country ?? ""] ?? j.country].filter(Boolean).join(", ") ||
                "no location";
              return (
                <li key={j.id} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium">{j.title}</h3>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        {e?.name ?? "Employer"}
                        {e?.status !== "approved" && (
                          <span className="rounded bg-secondary/10 px-1.5 py-0.5 text-xs text-secondary">
                            organisation not approved
                          </span>
                        )}
                      </p>

                      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {location}
                          {j.is_remote && " · Remote"}
                        </div>
                        <div>{labels.nursing_role[j.nursing_role ?? ""] ?? "no role"}</div>
                        <div>{labels.specialty[j.specialty ?? ""] ?? "no specialty"}</div>
                        <div>{labels.work_setting[j.work_setting ?? ""] ?? "no setting"}</div>
                        <div>{labels.employment_type[j.employment_type] ?? j.employment_type}</div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {j.application_deadline ?? "no deadline"}
                          {deadlinePassed(j.application_deadline) && (
                            <span className="rounded bg-secondary/10 px-1.5 py-0.5 text-secondary">
                              deadline passed
                            </span>
                          )}
                        </div>
                      </dl>

                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-primary">
                          Read the full posting
                        </summary>
                        <div
                          className="mt-2 max-w-2xl space-y-2 border-l-2 border-border pl-3 text-sm text-muted-foreground [&_h3]:mt-3 [&_h3]:font-medium [&_h3]:text-foreground"
                          dangerouslySetInnerHTML={{ __html: jobDescriptionHtml(j) }}
                        />
                      </details>
                    </div>

                    <JobReviewActions jobId={j.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Recently reviewed
          </h2>
          <ul className="space-y-2">
            {decided.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{j.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {empById.get(j.employer_id)?.name}
                  </span>
                </span>
                <span
                  className={
                    j.status === "active"
                      ? "rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                      : "rounded bg-muted px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground"
                  }
                >
                  {j.status.replace(/_/g, " ")}
                </span>
                {j.status === "active" && (
                  <Link href={`/jobs/${j.slug}`} className="text-xs text-primary hover:underline">
                    View live
                  </Link>
                )}
                <JobReviewActions jobId={j.id} compact current={j.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

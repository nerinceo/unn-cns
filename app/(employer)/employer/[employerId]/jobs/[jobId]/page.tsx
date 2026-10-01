import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { JOB_COLS } from "@/lib/cns/jobs";
import { getJobComposerOptions } from "@/lib/cns/taxonomy";
import { JobComposer } from "@/components/jobs/JobComposer";
import { JobStatusActions } from "@/components/jobs/JobStatusActions";
import { ScreeningEditor } from "@/components/jobs/ScreeningEditor";

export const dynamic = "force-dynamic";

/**
 * Edit a role.
 *
 * Employer members can read their own drafts (the public policy is limited to
 * published rows, the employer policy is not), so a draft loads here and saves
 * in place through the same composer used to create one.
 */
export default async function EditJobPage({
  params,
}: {
  params: Promise<{ employerId: string; jobId: string }>;
}) {
  const { employerId, jobId } = await params;
  const supabase = await createClient();

  const { data: jobRow } = await supabase
    .from("cns_jobs")
    .select(JOB_COLS)
    .eq("id", jobId)
    .eq("employer_id", employerId)
    .maybeSingle();
  if (!jobRow) notFound();
  const job = jobRow as unknown as Record<string, unknown>;

  const [{ data: employer }, { data: questions }, jobOptions] = await Promise.all([
    supabase.from("cns_employers").select("status").eq("id", employerId).maybeSingle(),
    supabase
      .from("cns_job_screening_questions")
      .select("question,question_type,is_required,knockout_expected,knockout_min")
      .eq("job_id", jobId)
      .order("position"),
    getJobComposerOptions(),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href={`/employer/${employerId}/jobs`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Roles
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{job.title as string}</h1>
          <p className="mt-1 text-sm capitalize text-muted-foreground">
            {String(job.status).replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {job.status === "active" && (
            <Link
              href={`/jobs/${job.slug as string}`}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Eye className="h-3.5 w-3.5" /> View live
            </Link>
          )}
          <JobStatusActions
            jobId={jobId}
            status={job.status as string}
            canPublish={employer?.status === "approved"}
          />
        </div>
      </header>

      <JobComposer
        employerId={employerId}
        canPublish={employer?.status === "approved"}
        options={jobOptions}
        existing={{ ...job, id: jobId }}
      />

      <ScreeningEditor jobId={jobId} initial={(questions ?? []) as never} />

      {job.changes_requested_note ? (
        <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-4 text-sm">
          <p className="font-medium text-secondary">Nerusalem asked for changes</p>
          <p className="mt-1 text-muted-foreground">{job.changes_requested_note as string}</p>
        </div>
      ) : null}
    </div>
  );
}

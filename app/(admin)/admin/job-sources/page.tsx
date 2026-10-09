import Link from "next/link";
import { notFound } from "next/navigation";
import { Rss, AlertTriangle, CheckCircle2, PenLine } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaff } from "@/lib/cns/admin";
import { COUNTRY_OPTIONS } from "@/lib/cns/job-import/text";
import {
  JobSourceRowActions, NewJobSourceForm, ManualJobForm,
} from "@/components/jobs/JobSourceControls";
import { JobReviewActions } from "@/components/jobs/JobReviewActions";

export const dynamic = "force-dynamic";
// "Run now" executes a whole import inside this page's server action.
export const maxDuration = 300;
export const metadata = { title: "Job sources — Central Nerusalem Space Admin" };

const KIND_LABEL: Record<string, string> = {
  adzuna: "Adzuna API", jooble: "Jooble API", greenhouse: "Greenhouse board", lever: "Lever board",
  manual: "Added by hand",
};

function describe(kind: string, config: Record<string, unknown>): string {
  const c = (k: string) => (typeof config[k] === "string" ? (config[k] as string) : "");
  if (kind === "adzuna" || kind === "jooble") {
    return [c("keywords") || "nurse", c("location"), (c("country") || "").toUpperCase()]
      .filter(Boolean).join(" · ");
  }
  if (kind === "greenhouse") return `boards.greenhouse.io/${c("board")}`;
  if (kind === "lever") return `jobs.lever.co/${c("site")}`;
  return "";
}

/**
 * Imported job listings: where they come from, whether each feed is on, and
 * what its last runs did.
 *
 * Service role throughout (cns_job_sources has no policies); staff checked
 * first, here and in every action.
 */
export default async function JobSourcesPage() {
  if (!(await isStaff())) notFound();
  const admin = createAdminClient();

  const [{ data: sources }, { data: runs }, { data: recent }, liveCount] = await Promise.all([
    admin
      .from("cns_job_sources")
      .select("id,kind,name,config,enabled,auto_publish,max_per_run,last_run_at,last_status,last_error")
      .order("created_at"),
    admin
      .from("cns_job_import_runs")
      .select("source_id,started_at,fetched,inserted,updated,skipped,closed,error")
      .order("started_at", { ascending: false })
      .limit(60),
    admin
      .from("cns_jobs")
      .select("id,slug,title,status,source_name,city,imported_at,employer:employer_id(name)")
      .neq("source", "native")
      .order("imported_at", { ascending: false, nullsFirst: false })
      .limit(30),
    admin.from("cns_jobs").select("id", { count: "exact", head: true }).neq("source", "native").eq("status", "active"),
  ]);

  const feeds = (sources ?? []).filter((s) => s.kind !== "manual");
  const runsBySource = new Map<string, NonNullable<typeof runs>>();
  for (const r of runs ?? []) {
    const list = runsBySource.get(r.source_id as string) ?? [];
    if (list.length < 3) list.push(r);
    runsBySource.set(r.source_id as string, list);
  }
  const keysMissing = [
    !process.env.JOOBLE_API_KEY && feeds.some((s) => s.kind === "jooble") ? "JOOBLE_API_KEY" : null,
    (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) && feeds.some((s) => s.kind === "adzuna")
      ? "ADZUNA_APP_ID / ADZUNA_APP_KEY" : null,
  ].filter(Boolean);

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <Rss className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-semibold">Job sources</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Nursing and healthcare roles imported from job networks and hospital careers boards. Every
          source that is on runs four times a day. Imported roles show where they came from and send
          applicants to the original posting. {liveCount.count ?? 0} are live now.
        </p>
        {keysMissing.length > 0 && (
          <p className="mt-3 flex max-w-2xl items-start gap-2 rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary" />
            Not set on this deployment: {keysMissing.join(", ")}. Those sources will fail until the
            key is added in Vercel.
          </p>
        )}
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Sources ({feeds.length})
        </h2>
        {feeds.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            No sources yet. Add one below.
          </p>
        ) : (
          <ul className="space-y-3">
            {feeds.map((s) => {
              const config = (s.config ?? {}) as Record<string, unknown>;
              const lastRuns = runsBySource.get(s.id as string) ?? [];
              return (
                <li key={s.id as string} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="flex flex-wrap items-center gap-2 font-medium">
                        {s.name as string}
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                          {KIND_LABEL[s.kind as string] ?? s.kind}
                        </span>
                        <span
                          className={
                            s.enabled
                              ? "rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
                              : "rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
                          }
                        >
                          {s.enabled ? "On" : "Off"}
                        </span>
                      </h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">{describe(s.kind as string, config)}</p>

                      {s.last_run_at ? (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {s.last_status === "ok" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-secondary" />
                          )}
                          Last run {new Date(s.last_run_at as string).toLocaleString()}
                          {s.last_error ? ` — ${s.last_error as string}` : ""}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">Never run.</p>
                      )}

                      {lastRuns.length > 0 && (
                        <table className="mt-3 text-xs text-muted-foreground">
                          <thead>
                            <tr className="text-left">
                              <th className="pr-4 font-medium">Run</th>
                              <th className="pr-3 font-medium">Fetched</th>
                              <th className="pr-3 font-medium">New</th>
                              <th className="pr-3 font-medium">Updated</th>
                              <th className="pr-3 font-medium">Skipped</th>
                              <th className="pr-3 font-medium">Closed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lastRuns.map((r) => (
                              <tr key={r.started_at as string}>
                                <td className="pr-4">{new Date(r.started_at as string).toLocaleString()}</td>
                                <td className="pr-3">{r.fetched as number}</td>
                                <td className="pr-3">{r.inserted as number}</td>
                                <td className="pr-3">{r.updated as number}</td>
                                <td className="pr-3">{r.skipped as number}</td>
                                <td className="pr-3">{r.error ? "failed" : (r.closed as number)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <JobSourceRowActions
                      sourceId={s.id as string}
                      enabled={Boolean(s.enabled)}
                      autoPublish={Boolean(s.auto_publish)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-1 font-medium">Add a source</h2>
        <p className="mb-4 max-w-2xl text-xs text-muted-foreground">
          Jooble and Adzuna need a free API key in Vercel. Adzuna allows a 14-day evaluation for
          commercial sites, then may need a licence. Greenhouse and Lever boards are public and need
          no key — use the name in the hospital&apos;s careers URL.
        </p>
        <NewJobSourceForm countries={COUNTRY_OPTIONS} />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-medium">
          <PenLine className="h-4 w-4 text-primary" /> Add a role by hand
        </h2>
        <p className="mb-4 max-w-2xl text-xs text-muted-foreground">
          For a role found on a hospital&apos;s own site. It goes live straight away, shows the site it came
          from, and sends applicants to the link you give.
        </p>
        <ManualJobForm countries={COUNTRY_OPTIONS} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Latest imported roles
        </h2>
        {(recent ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            Nothing imported yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {(recent ?? []).map((j) => (
              <li
                key={j.id as string}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{j.title as string}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {(j.employer as unknown as { name?: string } | null)?.name}
                    {j.city ? ` · ${j.city as string}` : ""} · via {j.source_name as string}
                  </span>
                </span>
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                  {(j.status as string).replace(/_/g, " ")}
                </span>
                {j.status === "active" && (
                  <Link href={`/jobs/${j.slug as string}`} className="text-xs text-primary hover:underline">
                    View live
                  </Link>
                )}
                <JobReviewActions jobId={j.id as string} compact current={j.status as string} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

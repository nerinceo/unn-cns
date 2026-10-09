import "server-only";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeExternalUrl } from "@/lib/cns/url";
import { logError } from "@/lib/errors";
import { fetchSource, type ImportedJob, type SourceRow } from "./adapters";
import { dedupeKey, normaliseName, slugify } from "./text";

/**
 * The import pipeline: fetch → validate → dedupe → stub employers → upsert →
 * close what has gone. Runs as the service role from /api/cron/import-jobs
 * (four times a day) and from the "Run now" button in /admin/job-sources.
 *
 * Request count, not query cost, is the platform's database bottleneck, so
 * every step is batched: one source run is roughly 6–10 requests whatever the
 * number of roles.
 */

type Admin = ReturnType<typeof createAdminClient>;

export type RunStats = {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  closed: number;
  error?: string;
};

const CHUNK = 150;
/** Not seen upstream for this long: the role has been filled or withdrawn. */
const GONE_AFTER_DAYS = 7;
/** Imported roles never stay up longer than this, seen or not. */
const MAX_AGE_DAYS = 30;
/** closed_reason values the pipeline may reopen when the role reappears. */
const REOPENABLE = ["source_gone", "source_disabled"];

const chunks = <T,>(xs: T[], n = CHUNK) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const suffix = () => randomBytes(4).toString("hex").slice(0, 5);

export const SOURCE_COLS = "id,kind,name,config,enabled,auto_publish,max_per_run";

/* -------------------------------------------------------------------------- */

/** Stub employer ids for these company names, creating the missing ones. */
async function stubEmployers(admin: Admin, companies: string[]): Promise<Map<string, string>> {
  const byKey = new Map<string, string>(); // stub_key -> company display name
  for (const c of companies) {
    const k = normaliseName(c);
    if (k && !byKey.has(k)) byKey.set(k, c);
  }
  const keys = Array.from(byKey.keys());
  const ids = new Map<string, string>();

  const load = async () => {
    for (const part of chunks(keys)) {
      const { data, error } = await admin.from("cns_employers").select("id,stub_key").in("stub_key", part);
      if (error) throw new Error(`stub lookup: ${error.message}`);
      for (const r of data ?? []) ids.set(r.stub_key as string, r.id as string);
    }
  };
  await load();

  const missing = keys.filter((k) => !ids.has(k));
  if (missing.length) {
    const rows = missing.map((k) => {
      const name = byKey.get(k)!.slice(0, 120);
      return {
        name,
        slug: `${slugify(name) || "employer"}-${suffix()}`,
        stub_key: k,
        is_stub: true,
        employer_type: "other",
        // Approved so its roles are publicly readable (the public policy
        // requires it); UNVERIFIED so it never carries the verified badge or
        // enters the verified-employer directory.
        status: "approved",
        verification_status: "unverified",
      };
    });
    for (const part of chunks(rows)) {
      const { error } = await admin
        .from("cns_employers")
        .upsert(part, { onConflict: "stub_key", ignoreDuplicates: true });
      if (error) throw new Error(`stub insert: ${error.message}`);
    }
    await load();
  }

  const out = new Map<string, string>();
  for (const c of companies) {
    const id = ids.get(normaliseName(c));
    if (id) out.set(c, id);
  }
  return out;
}

/**
 * Save one batch of roles from one source. Exported for the manual "add a
 * role" form, which goes through exactly the same checks as the feeds.
 */
export async function ingest(
  admin: Admin,
  source: SourceRow,
  jobs: (ImportedJob & { sourceName?: string; deadline?: string | null })[]
): Promise<Omit<RunStats, "fetched" | "closed">> {
  const now = new Date().toISOString();
  let skipped = 0;

  // 1. Validate, and drop repeats inside the batch.
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const valid: (typeof jobs[number] & { applyUrl: string; key: string })[] = [];
  for (const j of jobs) {
    const applyUrl = safeExternalUrl(j.applyUrl);
    const key = dedupeKey(j.title, j.company, j.city);
    if (
      !j.sourceJobId || !j.title || !j.company || !applyUrl ||
      seenIds.has(j.sourceJobId) || seenKeys.has(key)
    ) {
      skipped++;
      continue;
    }
    seenIds.add(j.sourceJobId);
    seenKeys.add(key);
    valid.push({ ...j, applyUrl, key });
  }
  if (!valid.length) return { inserted: 0, updated: 0, skipped };

  // 2. Which of these do we already hold?
  type Existing = { source_job_id: string; slug: string; status: string; published_at: string | null; closed_reason: string | null };
  const existing = new Map<string, Existing>();
  for (const part of chunks(valid.map((j) => j.sourceJobId))) {
    const { data, error } = await admin
      .from("cns_jobs")
      .select("source_job_id,slug,status,published_at,closed_reason")
      .eq("source", source.kind)
      .in("source_job_id", part);
    if (error) throw new Error(`existing lookup: ${error.message}`);
    for (const r of (data ?? []) as Existing[]) existing.set(r.source_job_id, r);
  }

  // 3. A NEW role another source already lists is the same role twice.
  const fresh = valid.filter((j) => !existing.has(j.sourceJobId));
  const dupes = new Set<string>();
  for (const part of chunks(fresh.map((j) => j.key))) {
    const { data, error } = await admin
      .from("cns_jobs")
      .select("dedupe_key")
      .in("dedupe_key", part)
      .in("status", ["active", "paused", "submitted"]);
    if (error) throw new Error(`dedupe lookup: ${error.message}`);
    for (const r of data ?? []) dupes.add(r.dedupe_key as string);
  }
  const toSave = valid.filter((j) => existing.has(j.sourceJobId) || !dupes.has(j.key));
  skipped += valid.length - toSave.length;
  if (!toSave.length) return { inserted: 0, updated: 0, skipped };

  // 4. Every role needs an employer row: an unverified stub per company.
  const employers = await stubEmployers(admin, toSave.map((j) => j.company));

  // 5. Upsert. Existing rows keep their slug, status and publish date — a role
  // staff removed must not come back on the next run.
  let inserted = 0;
  let updated = 0;
  const rows = [];
  for (const j of toSave) {
    const employerId = employers.get(j.company);
    if (!employerId) { skipped++; continue; }
    const prev = existing.get(j.sourceJobId);
    const reopen = prev && prev.status === "closed" && REOPENABLE.includes(prev.closed_reason ?? "");
    const status = prev
      ? reopen ? "active" : prev.status
      : source.auto_publish ? "active" : "submitted";
    if (prev) updated++; else inserted++;

    rows.push({
      source: source.kind,
      source_id: source.id,
      source_name: (j.sourceName ?? source.name).slice(0, 120),
      source_job_id: j.sourceJobId,
      source_url: j.applyUrl,
      dedupe_key: j.key,
      last_seen_at: now,
      imported_at: prev ? undefined : now,
      employer_id: employerId,
      slug: prev?.slug ?? `${slugify(j.title) || "role"}-${suffix()}`,
      title: j.title.slice(0, 200),
      description: j.description || `Full details are on ${j.sourceName ?? source.name}.`,
      employment_type: j.employmentType,
      work_mode: j.isRemote ? "remote" : "onsite",
      is_remote: j.isRemote,
      city: j.city,
      state: j.state,
      country: j.country,
      salary_min: j.salaryMin,
      salary_max: j.salaryMax,
      salary_currency: j.salaryCurrency ?? (j.salaryMin || j.salaryMax ? "INR" : null),
      salary_period: j.salaryPeriod ?? "MONTH",
      salary_undisclosed: !(j.salaryMin || j.salaryMax),
      application_deadline: j.deadline ?? null,
      apply_mode: "external",
      external_apply_url: j.applyUrl,
      status,
      closed_reason: reopen ? null : prev?.closed_reason ?? null,
      published_at: prev
        ? reopen ? now : prev.published_at
        : status === "active" ? now : null,
    });
  }

  for (const part of chunks(rows, 100)) {
    // imported_at is undefined on updates; strip it so the upsert keeps the
    // first-seen date (PostgREST would otherwise write NULL).
    const payload = part.map(({ imported_at, ...r }) => (imported_at ? { ...r, imported_at } : r));
    const withFirstSeen = payload.filter((r) => "imported_at" in r);
    const refreshes = payload.filter((r) => !("imported_at" in r));
    for (const batch of [withFirstSeen, refreshes]) {
      if (!batch.length) continue;
      const { error } = await admin
        .from("cns_jobs")
        .upsert(batch, { onConflict: "source,source_job_id" });
      if (error) throw new Error(`save: ${error.message}`);
    }
  }

  return { inserted, updated, skipped };
}

/** Close this source's roles that have gone upstream or aged out. */
async function closeStale(admin: Admin, source: SourceRow): Promise<number> {
  let closed = 0;
  // A manual role is never "seen" again by a feed, so only age closes it.
  if (source.kind !== "manual") {
    const { data, error } = await admin
      .from("cns_jobs")
      .update({ status: "closed", closed_reason: "source_gone" })
      .eq("source_id", source.id)
      .eq("status", "active")
      .lt("last_seen_at", daysAgo(GONE_AFTER_DAYS))
      .select("id");
    if (error) throw new Error(`close gone: ${error.message}`);
    closed += data?.length ?? 0;
  }
  const { data: aged, error: agedErr } = await admin
    .from("cns_jobs")
    .update({ status: "closed", closed_reason: "source_aged" })
    .eq("source_id", source.id)
    .eq("status", "active")
    .is("application_deadline", null)
    .lt("imported_at", daysAgo(MAX_AGE_DAYS))
    .select("id");
  if (agedErr) throw new Error(`close aged: ${agedErr.message}`);
  return closed + (aged?.length ?? 0);
}

/** One source, end to end, with its run logged. Never throws. */
export async function runSource(source: SourceRow): Promise<RunStats> {
  const admin = createAdminClient();
  const stats: RunStats = { fetched: 0, inserted: 0, updated: 0, skipped: 0, closed: 0 };

  const { data: run } = await admin
    .from("cns_job_import_runs")
    .insert({ source_id: source.id })
    .select("id")
    .single();

  try {
    const { jobs, fetched } = await fetchSource(source);
    stats.fetched = fetched;
    Object.assign(stats, await ingest(admin, source, jobs));
    // Only after a SUCCESSFUL fetch: an upstream outage must not read as
    // "every role has gone" and close the lot.
    stats.closed = await closeStale(admin, source);
  } catch (e) {
    stats.error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    logError("job-import:runSource", e, { sourceId: source.id, kind: source.kind });
  }

  const finished = new Date().toISOString();
  await Promise.all([
    run?.id
      ? admin.from("cns_job_import_runs").update({
          finished_at: finished,
          fetched: stats.fetched, inserted: stats.inserted, updated: stats.updated,
          skipped: stats.skipped, closed: stats.closed, error: stats.error ?? null,
        }).eq("id", run.id)
      : null,
    admin.from("cns_job_sources").update({
      last_run_at: finished,
      last_status: stats.error ? "error" : "ok",
      last_error: stats.error ?? null,
    }).eq("id", source.id),
  ]);
  return stats;
}

/** Every enabled feed, one after another, inside a time budget. */
export async function runAllSources(budgetMs: number) {
  const started = Date.now();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cns_job_sources")
    .select(SOURCE_COLS)
    .eq("enabled", true)
    .neq("kind", "manual")
    // Least recently run first, so a source cut off by the budget goes first
    // next time rather than starving.
    .order("last_run_at", { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);

  const results: { source: string; stats?: RunStats; skipped?: boolean }[] = [];
  for (const s of (data ?? []) as SourceRow[]) {
    if (Date.now() - started > budgetMs) {
      results.push({ source: s.name, skipped: true });
      continue;
    }
    results.push({ source: s.name, stats: await runSource(s) });
  }
  return results;
}

/**
 * Turning a source off takes its roles down with it — the kill switch for a
 * feed that starts sending junk. They come back if it is turned on again and
 * still lists them.
 */
export async function closeSourceJobs(sourceId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cns_jobs")
    .update({ status: "closed", closed_reason: "source_disabled" })
    .eq("source_id", sourceId)
    .in("status", ["active", "submitted"])
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

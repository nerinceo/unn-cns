"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/result";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { isStaff } from "@/lib/cns/admin";
import { actionError, logError } from "@/lib/errors";
import {
  LIMITS, all, bool, optDate, optText, reqId, reqInt, reqOneOf, reqText, reqUrl,
} from "@/lib/validate";
import { defaultSourceName, type SourceRow } from "@/lib/cns/job-import/adapters";
import { COUNTRY_OPTIONS, countryValue, employmentType, htmlToText } from "@/lib/cns/job-import/text";
import {
  SOURCE_COLS, closeSourceJobs, ingest, runSource, type RunStats,
} from "@/lib/cns/job-import/run";

/**
 * Staff management of imported-job sources.
 *
 * cns_job_sources has RLS on and NO policies, so every read and write here is
 * the service role — which is exactly why each action checks staff FIRST.
 * There is no database-side backstop for these, unlike the job review actions.
 */

const FEED_KINDS = ["adzuna", "jooble", "greenhouse", "lever"] as const;
const ADZUNA_COUNTRIES = ["in", "gb", "us", "au", "ca", "nz", "de", "sg", "ch"] as const;
const ADZUNA_CURRENCY: Record<string, string> = {
  in: "INR", gb: "GBP", us: "USD", au: "AUD", ca: "CAD", nz: "NZD", de: "EUR", sg: "SGD", ch: "CHF",
};
const ISO = COUNTRY_OPTIONS.map((c) => c.iso);
const TYPES = ["full-time", "part-time", "contract", "temporary", "permanent", "casual", "internship"] as const;

async function requireStaff(): Promise<string | null> {
  if (!(await isStaff())) return null;
  return (await getCurrentUser())?.id ?? null;
}

function refresh() {
  revalidatePath("/admin/job-sources");
  revalidatePath("/jobs");
}

export async function createJobSource(form: FormData): Promise<ActionResult> {
  const uid = await requireStaff();
  if (!uid) return { error: "Not permitted." };

  const kind = reqOneOf(form.get("kind"), "Source type", FEED_KINDS);
  if (!kind.ok) return { error: kind.error };

  let config: Record<string, unknown>;
  let name: string;

  if (kind.value === "adzuna") {
    const v = all({
      country: reqOneOf(form.get("adzunaCountry"), "Country", ADZUNA_COUNTRIES),
      keywords: optText(form.get("keywords"), "Keywords", LIMITS.short),
      location: optText(form.get("location"), "Location", LIMITS.short),
    });
    if (!v.ok) return { error: v.error };
    config = { ...v.value, currency: ADZUNA_CURRENCY[v.value.country] };
    name = defaultSourceName("adzuna");
  } else if (kind.value === "jooble") {
    const v = all({
      country: reqOneOf(form.get("country"), "Country", ISO),
      keywords: optText(form.get("keywords"), "Keywords", LIMITS.short),
      location: optText(form.get("location"), "Location", LIMITS.short),
    });
    if (!v.ok) return { error: v.error };
    config = v.value;
    name = defaultSourceName("jooble");
  } else {
    const v = all({
      handle: reqText(form.get("handle"), kind.value === "greenhouse" ? "Board token" : "Site name", 100),
      company: reqText(form.get("company"), "Hospital name", LIMITS.name, { noEmoji: true }),
      country: reqOneOf(form.get("country"), "Country", ISO),
    });
    if (!v.ok) return { error: v.error };
    if (!/^[A-Za-z0-9_-]+$/.test(v.value.handle)) {
      return { error: "Use only the name from the careers URL — letters, numbers, - and _." };
    }
    config = {
      [kind.value === "greenhouse" ? "board" : "site"]: v.value.handle,
      company: v.value.company,
      country: v.value.country,
      allJobs: bool(form.get("allJobs")),
      ...(kind.value === "lever" ? { eu: bool(form.get("eu")) } : {}),
    };
    name = defaultSourceName(kind.value, v.value.company);
  }

  const max = reqInt(form.get("maxPerRun") || "100", "Roles per run", { min: 1, max: 500 });
  if (!max.ok) return { error: max.error };

  const { error } = await createAdminClient().from("cns_job_sources").insert({
    kind: kind.value,
    name,
    config,
    max_per_run: max.value,
    // Off until staff press "Turn on" — a source is checked with "Run now" first.
    enabled: false,
    auto_publish: true,
    created_by: uid,
  });
  if (error) return actionError("admin-job-sources:create", error);
  refresh();
  return { ok: true };
}

export async function setJobSourceFlags(
  sourceId: string,
  flags: { enabled?: boolean; autoPublish?: boolean }
): Promise<ActionResult & { closed?: number }> {
  if (!(await requireStaff())) return { error: "Not permitted." };
  const id = reqId(sourceId, "Source");
  if (!id.ok) return { error: id.error };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (flags.enabled !== undefined) patch.enabled = Boolean(flags.enabled);
  if (flags.autoPublish !== undefined) patch.auto_publish = Boolean(flags.autoPublish);

  const { error } = await createAdminClient().from("cns_job_sources").update(patch).eq("id", id.value);
  if (error) return actionError("admin-job-sources:flags", error);

  let closed: number | undefined;
  if (flags.enabled === false) {
    try {
      closed = await closeSourceJobs(id.value);
    } catch (e) {
      logError("admin-job-sources:closeOnDisable", e, { sourceId: id.value });
      return { error: "The source is off, but its live roles could not all be closed. Try again." };
    }
  }
  refresh();
  return { ok: true, closed };
}

export async function deleteJobSource(sourceId: string): Promise<ActionResult> {
  if (!(await requireStaff())) return { error: "Not permitted." };
  const id = reqId(sourceId, "Source");
  if (!id.ok) return { error: id.error };
  try {
    // Roles come down first; the rows stay (source_id is nulled) so links that
    // nurses saved still resolve to an "applications have closed" page.
    await closeSourceJobs(id.value);
  } catch (e) {
    logError("admin-job-sources:delete:close", e, { sourceId: id.value });
    return { error: "Could not close this source's roles, so it was not deleted." };
  }
  const { error } = await createAdminClient().from("cns_job_sources").delete().eq("id", id.value);
  if (error) return actionError("admin-job-sources:delete", error);
  refresh();
  return { ok: true };
}

export async function runJobSourceNow(sourceId: string): Promise<ActionResult & { stats?: RunStats }> {
  if (!(await requireStaff())) return { error: "Not permitted." };
  const id = reqId(sourceId, "Source");
  if (!id.ok) return { error: id.error };

  const { data, error } = await createAdminClient()
    .from("cns_job_sources").select(SOURCE_COLS).eq("id", id.value).maybeSingle();
  if (error) return actionError("admin-job-sources:run:load", error);
  if (!data) return { error: "Source not found." };
  if ((data as SourceRow).kind === "manual") return { error: "Hand-added roles have nothing to fetch." };

  const stats = await runSource(data as SourceRow);
  refresh();
  return stats.error ? { error: stats.error, stats } : { ok: true, stats };
}

/**
 * A role staff found and add by hand. Goes through the same pipeline as the
 * feeds — validation, duplicate check, stub employer, external apply.
 */
export async function addManualJob(form: FormData): Promise<ActionResult> {
  const uid = await requireStaff();
  if (!uid) return { error: "Not permitted." };

  const v = all({
    title: reqText(form.get("title"), "Job title", LIMITS.title, { noEmoji: true }),
    company: reqText(form.get("company"), "Hospital / employer", LIMITS.name, { noEmoji: true }),
    applyUrl: reqUrl(form.get("applyUrl"), "Apply link"),
    city: optText(form.get("city"), "City", LIMITS.label),
    country: reqOneOf(form.get("country"), "Country", ISO),
    employment: reqOneOf(form.get("employmentType"), "Employment type", TYPES),
    description: reqText(form.get("description"), "Description", LIMITS.description, { multiline: true, min: 40 }),
    deadline: optDate(form.get("deadline"), "Closing date"),
  });
  if (!v.ok) return { error: v.error };
  const j = v.value;

  const admin = createAdminClient();
  // One shared "manual" source row, created the first time it is needed.
  let { data: source } = await admin
    .from("cns_job_sources").select(SOURCE_COLS).eq("kind", "manual").limit(1).maybeSingle();
  if (!source) {
    const { data: created, error } = await admin
      .from("cns_job_sources")
      .insert({ kind: "manual", name: "Added by Nerusalem", enabled: false, auto_publish: true, created_by: uid })
      .select(SOURCE_COLS)
      .single();
    if (error) return actionError("admin-job-sources:manual:source", error);
    source = created;
  }

  const host = new URL(j.applyUrl).hostname.replace(/^www\./, "");
  try {
    const res = await ingest(admin, source as SourceRow, [{
      sourceJobId: randomUUID(),
      sourceName: host,
      title: j.title,
      company: j.company,
      description: htmlToText(j.description),
      applyUrl: j.applyUrl,
      city: j.city,
      state: null,
      country: countryValue(j.country),
      employmentType: employmentType(j.employment),
      isRemote: false,
      salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      postedAt: null,
      deadline: j.deadline,
    }]);
    if (!res.inserted) {
      return { error: "This role is already on the board (same title, employer and city)." };
    }
  } catch (e) {
    logError("admin-job-sources:manual", e);
    return { error: "Could not save the role. Try again." };
  }
  refresh();
  return { ok: true };
}

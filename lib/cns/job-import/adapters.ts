import "server-only";
import {
  cityFromPlace, countryValue, employmentType, htmlToText, isHealthcareTitle, oneLine,
} from "./text";

/**
 * One adapter per upstream. Each turns that upstream's shape into an
 * ImportedJob and does nothing else — no database, no filtering beyond what
 * the upstream needs. The pipeline (run.ts) owns everything after this.
 *
 * API keys come from env vars and never touch the database or the client.
 */

export type SourceKind = "adzuna" | "jooble" | "greenhouse" | "lever" | "manual";
export const SOURCE_KINDS: readonly SourceKind[] = ["adzuna", "jooble", "greenhouse", "lever"];

export type SourceRow = {
  id: string;
  kind: SourceKind;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  auto_publish: boolean;
  max_per_run: number;
};

export type ImportedJob = {
  sourceJobId: string;
  title: string;
  company: string;
  description: string;
  applyUrl: string;
  city: string | null;
  state: string | null;
  /** cns_job_categories country value. */
  country: string | null;
  employmentType: string;
  isRemote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR" | null;
  postedAt: string | null;
};

export type FetchResult = { jobs: ImportedJob[]; fetched: number };

const UA = "NerusalemJobs/1.0 (+https://cns.nerusalem.com/jobs)";
const TIMEOUT_MS = 20_000;

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { "user-agent": UA, accept: "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const cfg = (s: SourceRow, k: string): string => str(s.config[k]).trim();
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Keyword filter, unless the source opted out (a hospital's own board). */
function keep(s: SourceRow, title: string): boolean {
  return s.config.allJobs === true || isHealthcareTitle(title);
}

/* ------------------------------------------------------------------ Adzuna */
// GET /v1/api/jobs/{country}/search/{page}. Terms: credit "Jobs by Adzuna"
// and send applicants through redirect_url, which is what applyUrl is.
const ADZUNA_ISO: Record<string, string> = {
  gb: "GB", us: "US", au: "AU", ca: "CA", in: "IN", nz: "NZ", de: "DE", sg: "SG", ch: "CH",
};

async function fetchAdzuna(s: SourceRow): Promise<FetchResult> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) throw new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY are not set");

  const country = (cfg(s, "country") || "in").toLowerCase();
  const what = cfg(s, "keywords") || "nurse";
  const perPage = 50;
  // The free tier is 250 calls a day; four runs a day of up to five pages each
  // stays far below it.
  const pages = Math.min(5, Math.ceil(s.max_per_run / perPage));

  const out: ImportedJob[] = [];
  let fetched = 0;
  for (let page = 1; page <= pages; page++) {
    const qs = new URLSearchParams({
      app_id: appId, app_key: appKey, results_per_page: String(perPage),
      what, max_days_old: "14", sort_by: "date", "content-type": "application/json",
    });
    if (cfg(s, "location")) qs.set("where", cfg(s, "location"));
    const data = (await getJson(
      `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/${page}?${qs}`
    )) as { results?: Record<string, unknown>[] };
    const results = data.results ?? [];
    fetched += results.length;

    for (const r of results) {
      const title = oneLine(str(r.title));
      if (!title || !keep(s, title)) continue;
      const loc = (r.location ?? {}) as { display_name?: string; area?: string[] };
      const area = loc.area ?? [];
      // Adzuna's estimated salaries are guesses; showing one as the employer's
      // pay would be a claim nobody made.
      const predicted = str(r.salary_is_predicted) === "1";
      out.push({
        sourceJobId: str(r.id),
        title,
        company: oneLine(str((r.company as { display_name?: string })?.display_name)),
        description: htmlToText(str(r.description)),
        applyUrl: str(r.redirect_url),
        city: area.length > 1 ? oneLine(area[area.length - 1], 120) : null,
        state: area.length > 2 ? oneLine(area[1], 120) : null,
        country: countryValue(ADZUNA_ISO[country] ?? null),
        employmentType: employmentType(str(r.contract_time), str(r.contract_type)),
        isRemote: /remote/i.test(`${title} ${loc.display_name ?? ""}`),
        salaryMin: predicted ? null : num(r.salary_min),
        salaryMax: predicted ? null : num(r.salary_max),
        salaryCurrency: predicted ? null : (cfg(s, "currency") || null),
        salaryPeriod: predicted ? null : "YEAR",
        postedAt: str(r.created) || null,
      });
    }
    if (results.length < perPage || out.length >= s.max_per_run) break;
  }
  return { jobs: out.slice(0, s.max_per_run), fetched };
}

/* ------------------------------------------------------------------ Jooble */
// POST /api/{key}. Terms: applicants go through Jooble's link.
async function fetchJooble(s: SourceRow): Promise<FetchResult> {
  const key = process.env.JOOBLE_API_KEY;
  if (!key) throw new Error("JOOBLE_API_KEY is not set");

  const perPage = 50;
  const pages = Math.min(5, Math.ceil(s.max_per_run / perPage));
  const out: ImportedJob[] = [];
  let fetched = 0;

  for (let page = 1; page <= pages; page++) {
    const res = await fetch(`https://jooble.org/api/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": UA },
      body: JSON.stringify({
        keywords: cfg(s, "keywords") || "nurse",
        location: cfg(s, "location"),
        page: String(page),
        ResultOnPage: String(perPage),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`jooble.org answered ${res.status}`);
    // Jooble ids are 19-digit integers: JSON.parse would round them past 2^53
    // and two roles would share an id. Quote them before parsing.
    const text = (await res.text()).replace(/"id"\s*:\s*(-?\d+)/g, '"id":"$1"');
    const data = JSON.parse(text) as { jobs?: Record<string, unknown>[] };
    const jobs = data.jobs ?? [];
    fetched += jobs.length;

    for (const r of jobs) {
      const title = oneLine(str(r.title));
      if (!title || !keep(s, title)) continue;
      const place = oneLine(str(r.location), 120);
      out.push({
        sourceJobId: str(r.id),
        title,
        company: oneLine(str(r.company)),
        description: htmlToText(str(r.snippet)),
        applyUrl: str(r.link),
        city: cityFromPlace(place),
        state: null,
        country: countryValue(cfg(s, "country") || null),
        employmentType: employmentType(str(r.type)),
        isRemote: /remote/i.test(`${title} ${place}`),
        // Jooble's salary is free text in any format — not parsed into numbers.
        salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
        postedAt: str(r.updated) || null,
      });
    }
    if (jobs.length < perPage || out.length >= s.max_per_run) break;
  }
  return { jobs: out.slice(0, s.max_per_run), fetched };
}

/* -------------------------------------------------------------- Greenhouse */
// Public Job Board API: no key. config.board is the board token from the
// hospital's careers URL (boards.greenhouse.io/<board>).
async function fetchGreenhouse(s: SourceRow): Promise<FetchResult> {
  const board = cfg(s, "board");
  if (!board) throw new Error("No Greenhouse board token set");
  const data = (await getJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`
  )) as { jobs?: Record<string, unknown>[] };
  const jobs = data.jobs ?? [];
  const company = cfg(s, "company") || s.name;

  const out: ImportedJob[] = [];
  for (const r of jobs) {
    const title = oneLine(str(r.title));
    if (!title || !keep(s, title)) continue;
    const place = oneLine(str((r.location as { name?: string })?.name), 120);
    out.push({
      sourceJobId: `${board}:${str(r.id)}`,
      title,
      company,
      description: htmlToText(str(r.content)),
      applyUrl: str(r.absolute_url),
      city: cityFromPlace(place),
      state: null,
      country: countryValue(cfg(s, "country") || null),
      employmentType: employmentType(title),
      isRemote: /remote/i.test(place),
      salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      postedAt: str(r.updated_at) || null,
    });
    if (out.length >= s.max_per_run) break;
  }
  return { jobs: out, fetched: jobs.length };
}

/* ------------------------------------------------------------------- Lever */
// Public Postings API: no key. config.site is the name in jobs.lever.co/<site>.
async function fetchLever(s: SourceRow): Promise<FetchResult> {
  const site = cfg(s, "site");
  if (!site) throw new Error("No Lever site name set");
  const host = s.config.eu === true ? "api.eu.lever.co" : "api.lever.co";
  const data = (await getJson(
    `https://${host}/v0/postings/${encodeURIComponent(site)}?mode=json`
  )) as Record<string, unknown>[];
  const jobs = Array.isArray(data) ? data : [];
  const company = cfg(s, "company") || s.name;

  const out: ImportedJob[] = [];
  for (const r of jobs) {
    const title = oneLine(str(r.text));
    if (!title || !keep(s, title)) continue;
    const cat = (r.categories ?? {}) as { location?: string; commitment?: string };
    const lists = Array.isArray(r.lists) ? (r.lists as { text?: string; content?: string }[]) : [];
    const body = [
      str(r.descriptionPlain),
      ...lists.map((l) => `${oneLine(l.text)}\n${htmlToText(l.content)}`),
      str(r.additionalPlain),
    ].filter(Boolean).join("\n\n");
    const place = oneLine(cat.location, 120);
    const created = num(r.createdAt);
    out.push({
      sourceJobId: `${site}:${str(r.id)}`,
      title,
      company,
      description: htmlToText(body),
      applyUrl: str(r.hostedUrl) || str(r.applyUrl),
      city: cityFromPlace(place),
      state: null,
      country: countryValue(str(r.country) || cfg(s, "country") || null),
      employmentType: employmentType(cat.commitment),
      isRemote: str(r.workplaceType) === "remote" || /remote/i.test(place),
      salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
      postedAt: created ? new Date(created).toISOString() : null,
    });
    if (out.length >= s.max_per_run) break;
  }
  return { jobs: out, fetched: jobs.length };
}

export async function fetchSource(s: SourceRow): Promise<FetchResult> {
  switch (s.kind) {
    case "adzuna": return fetchAdzuna(s);
    case "jooble": return fetchJooble(s);
    case "greenhouse": return fetchGreenhouse(s);
    case "lever": return fetchLever(s);
    case "manual": return { jobs: [], fetched: 0 };
  }
}

/** The badge text: "Via Adzuna", "Via Apollo Hospitals careers". */
export function defaultSourceName(kind: SourceKind, company?: string): string {
  if (kind === "adzuna") return "Adzuna";
  if (kind === "jooble") return "Jooble";
  return company ? `${company} careers` : "Employer careers site";
}

import "server-only";
import { unstable_cache } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * The six controlled vocabularies, read from cns_job_categories.
 *
 * These replace the hardcoded maps that used to live in job-constants.ts. The
 * point of the table is that an admin can add a specialty or retire a country
 * without a migration and a deploy — so nothing here may reintroduce a
 * hardcoded list.
 *
 * Cached for an hour: the lists change rarely and are read on every job page,
 * every search and every filter render. Revalidated by tag when an admin edits
 * them, so an edit is visible immediately rather than up to an hour later.
 */

export type TaxonomyKind =
  | "country"
  | "nursing_role"
  | "specialty"
  | "employment_type"
  | "work_setting"
  | "experience_level";

export type Category = {
  kind: TaxonomyKind;
  value: string;
  label: string;
  /** country -> ISO alpha-2; employment_type -> schema.org value; experience_level -> lower bound years */
  code: string | null;
  position: number;
};

export const TAXONOMY_TAG = "cns-job-taxonomy";

/**
 * A COOKIE-FREE client, and the whole point of this function.
 *
 * loadAll() used the cookie-backed server client. Inside unstable_cache() that
 * is illegal — Next throws:
 *
 *   used "cookies" inside a function cached with "unstable_cache(...)".
 *   Accessing Dynamic data sources inside a cache scope is not supported.
 *
 * It hid for so long because it only fires on a cache MISS. For the hour the
 * entry is warm the body never runs, so job pages render fine; then the TTL
 * lapses (or a deploy, or a cold lambda resets it) and whoever arrives next
 * eats the throw. Applying was the visible casualty: applyToJob -> buildSnapshot
 * -> getJobLabels -> loadAll, and a Server Action throw replaces the entire
 * route with an opaque digest, so applicants hit a dead page at random.
 *
 * The taxonomy is public reference data (is_active rows of cns_job_categories,
 * readable by anon — verified), so it never needed the caller's session. An
 * anon client has no cookies to read, which makes it correct to cache AND the
 * least privilege that works. Do not swap this back to the server client.
 */
function taxonomyClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

const loadAll = unstable_cache(
  async (): Promise<Category[]> => {
    const supabase = taxonomyClient();
    const { data } = await supabase
      .from("cns_job_categories")
      .select("kind,value,label,code,position")
      .eq("is_active", true)
      .order("position");
    return (data ?? []) as unknown as Category[];
  },
  ["cns-job-taxonomy-all"],
  { revalidate: 3600, tags: [TAXONOMY_TAG] }
);

export async function getTaxonomy(): Promise<Record<TaxonomyKind, Category[]>> {
  const all = await loadAll();
  const empty: Record<TaxonomyKind, Category[]> = {
    country: [], nursing_role: [], specialty: [],
    employment_type: [], work_setting: [], experience_level: [],
  };
  for (const c of all) (empty[c.kind] ??= []).push(c);
  return empty;
}

export async function getCategories(kind: TaxonomyKind): Promise<Category[]> {
  return (await loadAll()).filter((c) => c.kind === kind);
}

/** value -> label, for rendering a stored slug. */
export async function getLabels(kind: TaxonomyKind): Promise<Record<string, string>> {
  const list = await getCategories(kind);
  return Object.fromEntries(list.map((c) => [c.value, c.label]));
}

/**
 * schema.org employmentType for a stored value.
 *
 * Driven by the `code` column rather than a map in code, so the markup that
 * feeds Google for Jobs cannot drift from the vocabulary employers actually
 * pick from. Falls back to OTHER, which is a valid schema.org value — an
 * unrecognised type should degrade, not break eligibility.
 */
export async function schemaEmploymentType(value: string | null): Promise<string> {
  if (!value) return "OTHER";
  const list = await getCategories("employment_type");
  return list.find((c) => c.value === value)?.code ?? "OTHER";
}

/** ISO 3166-1 alpha-2 for a stored country value. */
export async function countryCode(value: string | null): Promise<string> {
  if (!value) return "IN";
  const list = await getCategories("country");
  const hit = list.find((c) => c.value === value);
  if (hit?.code) return hit.code;
  // Tolerate a legacy free-text country that predates the taxonomy.
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  return "IN";
}

/** Human label for a country value, for page copy. */
export async function countryLabel(value: string | null): Promise<string | null> {
  if (!value) return null;
  const list = await getCategories("country");
  return list.find((c) => c.value === value)?.label ?? value;
}

/**
 * All six label maps in one round trip.
 *
 * Pages render several dimensions at once (a card shows role, type and
 * setting), so fetching them individually would mean six awaits for data that
 * arrives from a single cached read anyway.
 */
export async function getJobLabels() {
  const t = await getTaxonomy();
  const map = (list: Category[]) => Object.fromEntries(list.map((c) => [c.value, c.label]));
  return {
    country: map(t.country),
    nursing_role: map(t.nursing_role),
    specialty: map(t.specialty),
    employment_type: map(t.employment_type),
    work_setting: map(t.work_setting),
    experience_level: map(t.experience_level),
  };
}

/**
 * The six vocabularies the job composer needs, shaped for a client component.
 *
 * Only value and label cross the boundary — `code` is a server concern (it
 * carries the schema.org mapping) and has no business in the form.
 */
export async function getJobComposerOptions() {
  const t = await getTaxonomy();
  const pick = (k: TaxonomyKind) => t[k].map((c) => ({ value: c.value, label: c.label }));
  return {
    employment_type: pick("employment_type"),
    nursing_role: pick("nursing_role"),
    specialty: pick("specialty"),
    work_setting: pick("work_setting"),
    experience_level: pick("experience_level"),
    country: pick("country"),
  };
}

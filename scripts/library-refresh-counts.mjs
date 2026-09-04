/**
 * Recompute cns_library_terms.article_count and .subtree_count from the
 * relationship table, in JS.
 *
 * WHY THIS EXISTS ALONGSIDE THE SQL FUNCTION. The canonical implementation is
 * cns_library_refresh_term_counts() in the migration, and it is the better one
 * — it runs in one round trip and cannot drift from the data. But it is a
 * SECURITY DEFINER function, so refreshing counts after an import depends on
 * that function being present and correct in the database. When it is not
 * (it shipped once without the WHERE clauses that Supabase's pg-safeupdate
 * demands, and failed with "UPDATE requires a WHERE clause"), the entire
 * library renders zero sections even though every article imported fine.
 *
 * This script is the operational fallback for that: same arithmetic, driven
 * from the client with the service-role key, needing nothing but the tables.
 *
 * Usage:
 *   node scripts/library-refresh-counts.mjs [--dry-run]
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry-run");

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim().replace(/^"(.*)"$/, "$1"),
    ])
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const fail = (m) => {
  console.error("\n  " + m + "\n");
  process.exit(1);
};

/** PostgREST caps a response at 1000 rows; 72,000 relationships need paging. */
async function readAll(table, select, applyFilters) {
  const out = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = db.from(table).select(select).range(from, from + page - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) fail(`${table} read: ${error.message}`);
    out.push(...data);
    process.stdout.write(`\r    ${table}: ${out.length}`);
    if (data.length < page) {
      process.stdout.write("\n");
      return out;
    }
  }
}

console.log("\n  reading");
const terms = await readAll("cns_library_terms", "*");
const links = await readAll("cns_library_article_terms", "article_id,term_id");
// Only published articles count, matching the SQL function exactly.
const published = new Set(
  (await readAll("cns_library_articles", "id", (q) => q.eq("status", "published"))).map((a) => a.id)
);

// term_id -> Set(article_id), published only
const direct = new Map();
for (const l of links) {
  if (!published.has(l.article_id)) continue;
  let s = direct.get(l.term_id);
  if (!s) direct.set(l.term_id, (s = new Set()));
  s.add(l.article_id);
}

const childrenOf = new Map();
for (const t of terms) {
  if (!t.parent_id) continue;
  const list = childrenOf.get(t.parent_id) ?? [];
  list.push(t.id);
  childrenOf.set(t.parent_id, list);
}

// Memoised post-order rollup. `visiting` breaks a parent_id cycle, which the
// schema permits and which would otherwise recurse until the stack blows.
const memo = new Map();
const visiting = new Set();
function subtree(id) {
  const hit = memo.get(id);
  if (hit) return hit;
  if (visiting.has(id)) return new Set();
  visiting.add(id);
  const acc = new Set(direct.get(id) ?? []);
  for (const child of childrenOf.get(id) ?? []) for (const a of subtree(child)) acc.add(a);
  visiting.delete(id);
  memo.set(id, acc);
  return acc;
}

const now = new Date().toISOString();
const changed = terms
  .map((t) => ({
    ...t,
    article_count: direct.get(t.id)?.size ?? 0,
    subtree_count: subtree(t.id).size,
    updated_at: now,
  }))
  .filter((t) => {
    const old = terms.find((o) => o.id === t.id);
    return old.article_count !== t.article_count || old.subtree_count !== t.subtree_count;
  });

const cats = changed.filter((t) => t.taxonomy === "category");
console.log(`\n  ${terms.length} terms, ${changed.length} need updating`);
console.log(`  top categories by subtree_count:`);
for (const t of [...cats].sort((a, b) => b.subtree_count - a.subtree_count).slice(0, 12)) {
  console.log(
    `    ${String(t.subtree_count).padStart(6)}  ${String(t.article_count).padStart(5)} direct   ${t.name}`
  );
}

if (DRY) {
  console.log("\n  --dry-run: nothing written\n");
  process.exit(0);
}

// Upsert on the primary key. Every column is round-tripped from the read, so
// only the two counts and updated_at differ — nothing else can be clobbered,
// least of all parent_id, which is the tree itself.
console.log("\n  writing");
for (let i = 0; i < changed.length; i += 500) {
  const slice = changed.slice(i, i + 500);
  const { error } = await db.from("cns_library_terms").upsert(slice, { onConflict: "id" });
  if (error) fail(`upsert: ${error.message}`);
  process.stdout.write(`\r    ${Math.min(i + 500, changed.length)}/${changed.length}`);
}
console.log("\n  done\n");

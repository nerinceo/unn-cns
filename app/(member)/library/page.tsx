import Link from "next/link";
import { Library, Search, FolderOpen } from "lucide-react";
import { ArticleGrid } from "@/components/library/ArticleGrid";
import { CategoryCard } from "@/components/library/CategoryCard";
import { getBrowseRoots, searchArticles } from "@/lib/cns/library";

export const dynamic = "force-dynamic";
export const metadata = { title: "Library — Central Nursing Systems" };

/**
 * Library root — browse by category.
 *
 * The categories ARE the information architecture. They came across from the
 * legacy WordPress blog untouched (see supabase/migrations/cns_library.sql),
 * and nine thousand articles are unnavigable without them: a reverse-chronological
 * wall of everything is a feed, not a library.
 *
 * Search shares this route rather than living at /library/search. It is the
 * same page in a different state, and a separate route would duplicate the
 * header, the empty state and the card grid to show the same rows.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  // No "recently added" rail. Every one of the 9,244 articles carries the same
  // import date, so a recency list is arbitrary ordering dressed up as
  // editorial — and it pushed the sections, which are the actual navigation,
  // below the fold.
  const [sections, results] = await Promise.all([
    getBrowseRoots(),
    query ? searchArticles(query) : Promise.resolve([]),
  ]);
  const total = sections.reduce((n, s) => n + s.subtree_count, 0);

  return (
    <div className="space-y-10">
      <header className="rounded-2xl border border-border bg-gradient-to-br from-primary/[0.08] via-card to-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Library className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Library</h1>
        </div>
        <p className="mt-3 max-w-2xl text-[16px] font-medium text-muted-foreground">
          Nursing articles, clinical guidelines and reference material, organised by subject.
        </p>

        {/* A plain GET form: no client component, no JavaScript, and the search
            is linkable and back-button-correct for free. */}
        <form action="/library" className="mt-6 flex max-w-xl gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search the library"
              aria-label="Search the library"
              className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[16px] outline-none ring-primary/30 placeholder:text-muted-foreground focus:ring-2"
            />
          </div>
          <button
            type="submit"
            className="h-11 shrink-0 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Search
          </button>
        </form>
      </header>

      {query ? (
        <section>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">
              {results.length ? `${results.length} result${results.length === 1 ? "" : "s"}` : "No results"}
              <span className="font-normal text-muted-foreground"> for &ldquo;{query}&rdquo;</span>
            </h2>
            <Link href="/library" className="text-sm font-medium text-primary hover:underline">
              Clear search
            </Link>
          </div>
          {results.length ? (
            <ArticleGrid articles={results} />
          ) : (
            <p className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
              Nothing matched that. Try a broader term, or browse by category below.
            </p>
          )}
        </section>
      ) : null}

      <section>
        <div className="mb-1 flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Browse by section</h2>
        </div>
        <p className="mb-5 text-muted-foreground">
          {total.toLocaleString("en-GB")} articles across {sections.length}{" "}
          {sections.length === 1 ? "section" : "sections"}.
        </p>

        {sections.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((cat) => (
              // subtree_count, not article_count. Every section holds zero
              // articles directly — a direct count would read 0 on all ten.
              <CategoryCard
                key={cat.id}
                name={cat.name}
                href={`/library/category/${cat.slug}`}
                subtopics={cat.children.length}
                articles={cat.subtree_count}
                previewTopics={cat.children.map((c) => c.name)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
            The library is empty. Once the archive import has run, sections appear here.
          </p>
        )}
      </section>

    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ArticleGrid } from "@/components/library/ArticleGrid";
import { CategoryCard } from "@/components/library/CategoryCard";
import { CategoryArt } from "@/components/library/CategoryArt";
import { categoryMesh, categoryMotif, categoryPalette } from "@/lib/cns/library-visuals";
import {
  getCategoryContext,
  listArticlesDirectlyIn,
  listArticlesInSubtree,
  PAGE_SIZE,
} from "@/lib/cns/library";

export const dynamic = "force-dynamic";

/**
 * A category page, in one of three modes.
 *
 *   ARCHIVE  the category contains other categories, so it lists those as
 *            cards and NOTHING else. Paging through 1,585 articles is not
 *            navigation; the ten subtopics are. This is the default the whole
 *            way down — Library > section > subsection > … — until a category
 *            has no children left, which is where the articles finally are.
 *   LEAF     no children, so it lists its articles.
 *   DIRECT   ?direct=1 on an archive, listing only the articles pinned to that
 *            category itself. Reached from the card the archive renders for
 *            its own name, and only exists for the four categories that hold
 *            both sections and articles.
 *
 * 38 categories are archives, 451 are leaves.
 *
 * The route is /library/category/<slug>, not /library/<slug>, because category
 * and tag slugs live in separate namespaces and legitimately collide — a
 * "Pharmacology" category and a "pharmacology" tag can both exist. WordPress
 * namespaces its own archives for the same reason.
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCategoryContext(slug);
  return {
    title: ctx ? `${ctx.term.name} — Library — Central Nursing Systems` : "Library",
    description: ctx?.term.description ?? undefined,
  };
}

export default async function LibraryCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; direct?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const page = Math.max(1, Number(sp.page) || 1);

  const ctx = await getCategoryContext(slug);
  if (!ctx) notFound();
  const { term, ancestors, children, isArchive } = ctx;

  const direct = sp.direct === "1" && term.article_count > 0;
  const showArchive = isArchive && !direct;

  const articles = showArchive
    ? []
    : direct
      ? await listArticlesDirectlyIn(term.id, page)
      : await listArticlesInSubtree(term.id, page);

  const total = direct ? term.article_count : term.subtree_count;
  const totalPages = showArchive ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));

  const motif = categoryMotif(term.name);
  const mesh = categoryMesh(term.name);
  const palette = categoryPalette(term.name);
  const pageHref = (n: number) =>
    `/library/category/${slug}?${direct ? "direct=1&" : ""}page=${n}`;

  return (
    <div className="space-y-8">
      <nav className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
        <Link href="/library" className="hover:text-foreground">
          Library
        </Link>
        {ancestors.map((a) => (
          <span key={a.id} className="flex items-center gap-1.5">
            <span aria-hidden>/</span>
            <Link href={`/library/category/${a.slug}`} className="hover:text-foreground">
              {a.name}
            </Link>
          </span>
        ))}
        <span aria-hidden>/</span>
        {direct ? (
          <Link href={`/library/category/${slug}`} className="hover:text-foreground">
            {term.name}
          </Link>
        ) : (
          <span className="font-medium text-foreground">{term.name}</span>
        )}
        {direct ? (
          <>
            <span aria-hidden>/</span>
            <span className="font-medium text-foreground">Articles</span>
          </>
        ) : null}
      </nav>

      {/* The header is the page's own cover — same mesh, grain and artwork as
          the cards, at a scale that lets the drawing actually read. */}
      <header
        className="relative overflow-hidden rounded-3xl border border-border shadow-card"
        style={{ backgroundImage: mesh }}
      >
        <span aria-hidden className="library-grain absolute inset-0" />
        <span
          aria-hidden
          className="library-card-drift absolute -left-16 -top-20 h-64 w-64 rounded-full"
          style={{ backgroundColor: `${palette.spark}30` }}
        />
        <CategoryArt
          motif={motif}
          className="pointer-events-none absolute -right-6 top-1/2 h-40 w-64 -translate-y-1/2 text-white/25 sm:h-48 sm:w-80"
        />

        <div className="relative px-6 py-8 sm:px-8 sm:py-10">
          <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-white ring-1 ring-inset ring-white/25 backdrop-blur-sm">
            {total.toLocaleString("en-GB")} {total === 1 ? "article" : "articles"}
            {showArchive && children.length
              ? ` · ${children.length} ${children.length === 1 ? "subtopic" : "subtopics"}`
              : ""}
          </span>

          <h1 className="mt-3 max-w-2xl text-3xl font-bold leading-tight tracking-tight text-white">
            {term.name}
          </h1>

          {term.description ? (
            <p className="mt-2 max-w-2xl text-[16px] text-white/85">{term.description}</p>
          ) : null}

          {!showArchive && totalPages > 1 ? (
            <p className="mt-2 text-sm font-medium text-white/70">
              Page {page} of {totalPages}
            </p>
          ) : null}
        </div>
      </header>

      {showArchive ? (
        <section>
          <h2 className="mb-5 text-xl font-semibold">Subtopics</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {children.map((child) => (
              <CategoryCard
                key={child.id}
                name={child.name}
                href={`/library/category/${child.slug}`}
                subtopics={child.child_count}
                articles={child.subtree_count}
                previewTopics={child.child_preview}
              />
            ))}

            {/* The four categories that hold articles of their own get one
                more tile, carrying the category's own name. Without it those
                35 articles have no link anywhere on the site. */}
            {term.article_count > 0 ? (
              <CategoryCard
                name={term.name}
                href={`/library/category/${slug}?direct=1`}
                subtopics={0}
                articles={term.article_count}
              />
            ) : null}
          </div>
        </section>
      ) : articles.length ? (
        <ArticleGrid articles={articles} />
      ) : (
        <p className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
          Nothing on this page.
        </p>
      )}

      {!showArchive && totalPages > 1 ? (
        <nav className="flex items-center justify-between border-t border-border pt-5">
          <PageLink href={pageHref(page - 1)} disabled={page <= 1} direction="prev" />
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <PageLink href={pageHref(page + 1)} disabled={page >= totalPages} direction="next" />
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({
  href,
  disabled,
  direction,
}: {
  href: string;
  disabled: boolean;
  direction: "prev" | "next";
}) {
  const label = direction === "prev" ? "Previous" : "Next";
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const content = (
    <>
      {direction === "prev" ? <Icon className="h-4 w-4" /> : null}
      {label}
      {direction === "next" ? <Icon className="h-4 w-4" /> : null}
    </>
  );

  // A disabled control renders as a span, not a dead link: an <a> with no href
  // is still focusable in some browsers and announces as a link that goes
  // nowhere.
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/50">
        {content}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary"
    >
      {content}
    </Link>
  );
}

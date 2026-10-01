import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, ListTree, UserRound } from "lucide-react";
import { ArticleToc } from "@/components/library/ArticleToc";
import { buildToc, getArticle } from "@/lib/cns/library";

export const dynamic = "force-dynamic";

/**
 * One library article.
 *
 * Laid out for reading rather than for filling the shell's width: the prose
 * column is capped at 68 characters and the contents rail takes the space that
 * would otherwise stretch lines to 1440px. Every article here runs 13 sections
 * under one template, so the rail is genuinely useful — a reader after
 * "Critical Values" should not have to scroll past ten sections to reach it.
 *
 * body_html is rendered with dangerouslySetInnerHTML. That is safe here and
 * only here because the HTML was sanitized at IMPORT time by
 * scripts/import-wordpress.mjs against a strict tag and attribute allowlist —
 * nothing arbitrary reaches this column. Sanitizing once on the way in rather
 * than on every render is the whole reason the column stores HTML at all; if
 * anything ever writes to it by another route, that route must sanitize too.
 * buildToc only adds an id to headings it already matched.
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Library — Central Nursing Systems" };
  return {
    title: `${article.seo_title ?? article.title} — Library`,
    description: article.seo_description ?? article.excerpt ?? undefined,
  };
}

export default async function LibraryArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) notFound();

  const { html, toc } = buildToc(article.body_html);
  const categories = article.terms.filter((t) => t.taxonomy === "category");
  const tags = article.terms.filter((t) => t.taxonomy === "tag");
  const primary = categories[0];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <nav className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
        <Link href="/library" className="inline-flex items-center gap-1 hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Library
        </Link>
        {primary ? (
          <>
            <span aria-hidden>/</span>
            <Link
              href={`/library/category/${primary.slug}`}
              className="truncate hover:text-foreground"
            >
              {primary.name}
            </Link>
          </>
        ) : null}
      </nav>

      <header className="mt-6 max-w-3xl">
        {categories.length ? (
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/library/category/${c.slug}`}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-opacity hover:opacity-80"
              >
                {c.name}
              </Link>
            ))}
          </div>
        ) : null}

        <h1 className="mt-4 text-3xl font-bold leading-[1.15] tracking-tight sm:text-[2.6rem]">
          {article.title}
        </h1>

        {article.excerpt ? (
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{article.excerpt}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-5 text-sm text-muted-foreground">
          {article.author_name ? (
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" />
              {article.author_name}
            </span>
          ) : null}
          {article.published_at ? (
            <time dateTime={article.published_at}>
              {new Date(article.published_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
          ) : null}
          {article.reading_minutes ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {article.reading_minutes} min read
            </span>
          ) : null}
          {toc.length ? (
            <span className="inline-flex items-center gap-1.5">
              <ListTree className="h-3.5 w-3.5" />
              {toc.length} sections
            </span>
          ) : null}
        </div>
      </header>

      {/* The rail is a real grid column, not an overlay, so the prose keeps its
          measure instead of being squeezed under a floating panel. */}
      <div className="mt-10 gap-14 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start">
        <div className="min-w-0">
          {/* Below lg the rail has nowhere to live, so contents collapse into a
              disclosure above the article — present, but shut by default so it
              never pushes the opening paragraph off a phone screen. */}
          {toc.length ? (
            <details className="mb-8 rounded-2xl border border-border bg-card px-5 py-4 lg:hidden">
              <summary className="cursor-pointer text-sm font-semibold">
                On this page
                <span className="ml-2 font-normal text-muted-foreground">
                  {toc.length} sections
                </span>
              </summary>
              <ul className="mt-3 space-y-1 border-l border-border">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="block py-1.5 pl-4 text-sm text-muted-foreground hover:text-foreground"
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {/*
            Article typography as arbitrary child variants rather than
            @tailwindcss/typography — the plugin is not a dependency here and
            adding one for a single surface is not worth it.

            Two things are doing the real work: a 68ch measure, which is the
            readable range for body prose regardless of how wide the shell is,
            and scroll-mt-28 on headings so a contents link does not park the
            section under the sticky app header.

            overflow-x-auto keeps a wide imported table from forcing the whole
            page to scroll sideways on a phone.
          */}
          <div
            className="max-w-[68ch] overflow-x-auto text-[18px] leading-[1.8] text-foreground
              [&_p]:my-5
              [&_h2]:mb-4 [&_h2]:mt-14 [&_h2]:scroll-mt-28 [&_h2]:text-[1.4rem] [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:tracking-tight [&_h2:first-child]:mt-0
              [&_h3]:mb-3 [&_h3]:mt-10 [&_h3]:scroll-mt-28 [&_h3]:text-lg [&_h3]:font-semibold
              [&_h4]:mb-2 [&_h4]:mt-8 [&_h4]:font-semibold
              [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-6
              [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-6
              [&_li]:my-2 [&_li]:pl-1 [&_li]:marker:text-muted-foreground
              [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
              [&_strong]:font-semibold [&_strong]:text-foreground
              [&_img]:my-8 [&_img]:rounded-xl [&_img]:border [&_img]:border-border
              [&_figure]:my-8 [&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:text-muted-foreground
              [&_blockquote]:my-8 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-5 [&_blockquote]:italic [&_blockquote]:text-muted-foreground
              [&_pre]:my-8 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-sm
              [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[15px]
              [&_table]:my-8 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[16px]
              [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2.5 [&_th]:text-left [&_th]:font-semibold
              [&_td]:border [&_td]:border-border [&_td]:p-2.5
              [&_iframe]:my-8 [&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:rounded-xl [&_iframe]:border [&_iframe]:border-border
              [&_hr]:my-10 [&_hr]:border-border"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {tags.length ? (
            <footer className="mt-14 max-w-[68ch] border-t border-border pt-6">
              <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                Tags
              </h2>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            </footer>
          ) : null}
        </div>

        {toc.length ? (
          <aside className="sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-y-auto lg:block">
            <ArticleToc items={toc} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, UserRound } from "lucide-react";
import { getArticle } from "@/lib/cns/library";

export const dynamic = "force-dynamic";

/**
 * One library article.
 *
 * body_html is rendered with dangerouslySetInnerHTML. That is safe here and
 * only here because the HTML was sanitized at IMPORT time by
 * scripts/import-wordpress.mjs, against a strict tag/attribute allowlist —
 * nothing arbitrary reaches this column. Sanitizing once on the way in rather
 * than on every render is the whole reason the column stores HTML at all; if
 * anything ever writes to it by another route, that route must sanitize too.
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

  const categories = article.terms.filter((t) => t.taxonomy === "category");
  const tags = article.terms.filter((t) => t.taxonomy === "tag");

  return (
    <article className="mx-auto max-w-3xl">
      <Link
        href="/library"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Library
      </Link>

      <header className="mt-5">
        {categories.length ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/library/category/${c.slug}`}
                className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-opacity hover:opacity-80"
              >
                {c.name}
              </Link>
            ))}
          </div>
        ) : null}

        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {article.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
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
        </div>
      </header>

      {article.featured_image_url ? (
        <div className="mt-7 overflow-hidden rounded-2xl border border-border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.featured_image_url}
            alt={article.featured_image_alt ?? ""}
            className="w-full object-cover"
          />
        </div>
      ) : null}

      {/*
        Article typography, expressed as arbitrary child variants rather than
        via @tailwindcss/typography — the plugin is not a dependency here, and
        adding one for a single surface is not worth it.

        overflow-x-auto on the wrapper is what keeps a wide imported table from
        forcing the whole page to scroll sideways on a phone.
      */}
      <div
        className="mt-8 overflow-x-auto text-[15px] leading-7 text-foreground
          [&_p]:my-4
          [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight
          [&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-semibold
          [&_h4]:mb-2 [&_h4]:mt-6 [&_h4]:font-semibold
          [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6
          [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6
          [&_li]:my-1.5
          [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
          [&_strong]:font-semibold
          [&_img]:my-6 [&_img]:rounded-xl [&_img]:border [&_img]:border-border
          [&_figure]:my-6 [&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:text-muted-foreground
          [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground
          [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-sm
          [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px]
          [&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
          [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left [&_th]:font-semibold
          [&_td]:border [&_td]:border-border [&_td]:p-2
          [&_iframe]:my-6 [&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:rounded-xl [&_iframe]:border [&_iframe]:border-border
          [&_hr]:my-8 [&_hr]:border-border"
        dangerouslySetInnerHTML={{ __html: article.body_html ?? "" }}
      />

      {tags.length ? (
        <footer className="mt-10 border-t border-border pt-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Tags
          </h2>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t.id}
                className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
              >
                {t.name}
              </span>
            ))}
          </div>
        </footer>
      ) : null}
    </article>
  );
}

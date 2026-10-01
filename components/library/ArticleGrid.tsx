import Link from "next/link";
import { Clock } from "lucide-react";
import type { LibraryArticleCard } from "@/lib/cns/library";

/**
 * The library card grid, shared by the index, the category pages and search.
 *
 * Plain <img>, not next/image, on purpose: until the media phase of the import
 * has rehosted everything to R2, featured images still point at the legacy
 * WordPress host — which is not in next.config remotePatterns, and next/image
 * throws at runtime on an unconfigured host rather than degrading to a plain
 * image. These are already CDN-served once the transfer completes.
 */
export function ArticleGrid({ articles }: { articles: LibraryArticleCard[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {articles.map((a) => (
        <Link
          key={a.id}
          href={`/library/${a.slug}`}
          className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40"
        >
          {a.featured_image_url ? (
            <div className="aspect-[16/9] overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.featured_image_url}
                alt={a.featured_image_alt ?? ""}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </div>
          ) : null}

          <div className="flex flex-1 flex-col p-5">
            <h3 className="font-semibold leading-snug group-hover:text-primary">{a.title}</h3>
            {a.excerpt ? (
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{a.excerpt}</p>
            ) : null}
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-muted-foreground">
              {a.published_at ? (
                <time dateTime={a.published_at}>
                  {new Date(a.published_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </time>
              ) : null}
              {a.reading_minutes ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {a.reading_minutes} min read
                </span>
              ) : null}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

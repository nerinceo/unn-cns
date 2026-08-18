import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Page links for the job board.
 *
 * Real <a href> links, not a client-side pager: a job board page has to be
 * crawlable and shareable, and page 3 of a search needs to survive being
 * pasted into a WhatsApp group — which is how most of these searches travel.
 */
export function JobPagination({
  page,
  pageCount,
  query,
}: {
  page: number;
  pageCount: number;
  /** Current search params WITHOUT `page`. */
  query: URLSearchParams;
}) {
  if (pageCount <= 1) return null;

  const href = (p: number) => {
    const next = new URLSearchParams(query);
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    const s = next.toString();
    return s ? `/jobs?${s}` : "/jobs";
  };

  // A window around the current page, always including the first and last.
  // 40 numbered links is not navigation, it is wallpaper.
  const windowed = new Set<number>([1, pageCount, page]);
  for (let d = 1; d <= 2; d++) {
    if (page - d >= 1) windowed.add(page - d);
    if (page + d <= pageCount) windowed.add(page + d);
  }
  const pages = Array.from(windowed).sort((a, b) => a - b);

  return (
    <nav className="flex items-center justify-center gap-1 pt-2" aria-label="Job results pages">
      <PagerLink
        href={href(page - 1)}
        disabled={page <= 1}
        label="Previous page"
        className="pr-3 pl-2"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </PagerLink>

      {pages.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && pages[i - 1] !== p - 1 && (
            <span className="px-1 text-sm text-muted-foreground" aria-hidden>
              …
            </span>
          )}
          <Link
            href={href(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm tabular-nums transition-colors",
              p === page
                ? "bg-primary font-medium text-primary-foreground"
                : "border border-border hover:border-primary"
            )}
          >
            {p}
          </Link>
        </span>
      ))}

      <PagerLink
        href={href(page + 1)}
        disabled={page >= pageCount}
        label="Next page"
        className="pl-3 pr-2"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </PagerLink>
    </nav>
  );
}

function PagerLink({
  href,
  disabled,
  label,
  className,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const base = cn(
    "flex h-9 items-center gap-1 rounded-md text-sm transition-colors",
    className
  );
  if (disabled) {
    return (
      <span className={cn(base, "cursor-not-allowed text-muted-foreground/50")} aria-disabled>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={cn(base, "border border-border hover:border-primary")}>
      {children}
    </Link>
  );
}

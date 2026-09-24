import Link from "next/link";
import { SearchX } from "lucide-react";

/**
 * The 404 every notFound() in this app lands on.
 *
 * Exists because without it Next serves its own built-in page — a bare
 * "404 | This page could not be found" on a blank white document, with no
 * header, no branding and no way back. To a member who followed a stale link
 * from HUB that does not read as "wrong address", it reads as a crash in the
 * middle of the product, on a different domain from the one they started on.
 *
 * Wording matches HUB's and UHN's so a 404 looks the same wherever you land in
 * the family, and both links are absolute-free: "/" is this app's own root, and
 * the library is the surface most stale CNS links point at.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <SearchX className="h-6 w-6 text-muted-foreground" aria-hidden />
        </span>
        <h1 className="mt-5 text-xl font-bold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The page you are looking for does not exist or has been moved. If
          someone shared a link with you, it may have been from an older version
          of Central Nursing Systems.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to home
          </Link>
          <Link
            href="/jobs"
            className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            Browse jobs
          </Link>
        </div>
      </div>
    </main>
  );
}

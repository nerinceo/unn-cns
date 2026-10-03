"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

/**
 * The error state for a portal section (member, employer, admin).
 *
 * Rendered by each section's error.tsx, which sits BELOW that section's
 * layout — so the AppShell (nav, portal switcher) stays on screen and only the
 * page content is replaced. Same look and wording as app/error.tsx; a <div>
 * rather than a <main> because the shell already provides the <main>.
 */
export function SectionError({
  error,
  reset,
  homeHref,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <AlertCircle className="h-6 w-6 text-muted-foreground" aria-hidden />
        </span>
        <h1 className="mt-5 text-xl font-bold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          We hit an unexpected error. Please try again or go back to the homepage.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            Try again
          </button>
          <Link
            href={homeHref}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to home
          </Link>
        </div>
      </div>
    </div>
  );
}

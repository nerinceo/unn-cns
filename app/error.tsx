"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

/**
 * The error page for anything that throws below the root layout.
 *
 * Exists because without it Next serves its bare "Application error: a
 * client-side exception has occurred" on a blank document — no header, no way
 * back, and no retry. The question bank throws on purpose when its content
 * source fails, so this is a page students can actually reach. Styled like
 * not-found.tsx, worded like HUB's and UHN's error pages.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[60dvh] items-center justify-center px-4 py-16">
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
            href="/"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to home
          </Link>
        </div>
      </div>
    </main>
  );
}

"use client";

import { SectionError } from "@/components/shell/SectionError";

/** Member portal errors. Sits below (member)/layout.tsx, so the shell survives. */
export default function MemberError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError error={error} reset={reset} homeHref="/" />;
}

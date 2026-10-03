"use client";

import { SectionError } from "@/components/shell/SectionError";

/** Admin portal errors. Sits below admin/layout.tsx, so the shell survives. */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError error={error} reset={reset} homeHref="/admin" />;
}

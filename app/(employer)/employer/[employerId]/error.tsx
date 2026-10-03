"use client";

import { useParams } from "next/navigation";
import { SectionError } from "@/components/shell/SectionError";

/**
 * Employer portal errors. Sits below [employerId]/layout.tsx, so the shell
 * survives, and "Go to home" returns to this organisation's dashboard.
 */
export default function EmployerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ employerId: string }>();
  const home = params?.employerId ? `/employer/${params.employerId}` : "/employer";
  return <SectionError error={error} reset={reset} homeHref={home} />;
}

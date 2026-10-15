import { redirect } from "next/navigation";
import { PRO_HOME } from "@/lib/cns/qbank-pro";

/** Progress tracking was removed (2026-10-15); the saved list lives at /saved. Old links land there. */
export default function ProProgressPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const q = new URLSearchParams();
  for (const k of ["type", "semester", "page"]) {
    const v = searchParams[k];
    if (typeof v === "string") q.set(k, v);
  }
  const qs = q.toString();
  redirect(`${PRO_HOME}/saved${qs ? `?${qs}` : ""}`);
}

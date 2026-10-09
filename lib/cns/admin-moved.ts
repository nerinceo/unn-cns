import "server-only";
import { notFound, redirect } from "next/navigation";
import { isStaff } from "@/lib/cns/admin";

/**
 * CNS admin moved into the UHN console on 2026-10-09 so every admin screen
 * lives in one place. The old /admin URLs here forward to their new homes —
 * bookmarks and notification links keep working.
 *
 * Staff are checked FIRST: a non-staff visitor still gets a 404 and does not
 * learn where the console is.
 */
const UHN_URL = (process.env.NEXT_PUBLIC_UHN_URL ?? "https://uhn.nerusalem.com").replace(/\/+$/, "");

export const MOVED_ADMIN = {
  overview: "/admin/cns",
  employers: "/admin/job-employers",
  jobs: "/admin/jobs",
  jobSources: "/admin/job-sources",
  reports: "/admin/job-reports",
  content: "/admin/cns",
  members: "/admin/cns",
} as const;

export async function forwardToUhnAdmin(page: keyof typeof MOVED_ADMIN): Promise<never> {
  if (!(await isStaff())) notFound();
  redirect(`${UHN_URL}${MOVED_ADMIN[page]}`);
}

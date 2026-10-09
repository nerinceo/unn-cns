import { notFound } from "next/navigation";
import { isStaff } from "@/lib/cns/admin";

/**
 * CNS admin moved into the UHN console on 2026-10-09. Every page under here
 * only forwards there (lib/cns/admin-moved.ts); this layout keeps the 404 for
 * anyone who is not staff.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isStaff())) notFound();
  return <>{children}</>;
}

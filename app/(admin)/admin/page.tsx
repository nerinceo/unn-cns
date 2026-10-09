import { forwardToUhnAdmin } from "@/lib/cns/admin-moved";

export const dynamic = "force-dynamic";

/** Moved to the UHN admin console (2026-10-09) — see lib/cns/admin-moved.ts. */
export default async function MovedAdminPage() {
  await forwardToUhnAdmin("overview");
}

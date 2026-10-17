import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, getCurrentUserProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hubListing } from "@/lib/hub";

/**
 * Who may open a university question bank (0080).
 *
 * Banks are sold in the HUB Store — the whole bank or any semesters — and a
 * paid order writes qbank_access rows (revoked again by any refund). This
 * reads the caller's own rows through RLS. Staff get no bypass here: they see
 * what they bought, exactly as a member does.
 *
 * EVERY page that loads questions calls requireSemester() / canOpenSemester()
 * BEFORE fetching them: whatever a page renders ships to the browser in the
 * RSC payload, so hiding it in the UI would not be a gate.
 */
export interface BankAccess {
  /** Whole bank (or staff). */
  all: boolean;
  semesters: Set<number>;
  /** Latest end of any active access, for display. */
  expiresAt: string | null;
  /** Where to buy it, when it is on sale. */
  buyUrl: string | null;
}

const NONE: BankAccess = { all: false, semesters: new Set(), expiresAt: null, buyUrl: null };

/**
 * `course` narrows to one course's access (a CNS course key, e.g.
 * 'bsc-nursing') — pass it wherever the URL names a course, so Semester 3 of
 * one course never opens Semester 3 of another. Without it, any course counts.
 */
export const getBankAccess = cache(async (institution: string, course?: string): Promise<BankAccess> => {
  const profile = await getCurrentUserProfile();
  const supabase = await createClient();

  let productQuery = supabase.from("qbank_products").select("listing_id").eq("institution", institution).eq("active", true);
  if (course) productQuery = productQuery.eq("course", course);
  const { data: product } = await productQuery.limit(1).maybeSingle();
  const buyUrl = product?.listing_id ? hubListing(product.listing_id) : null;

  // NO staff bypass (Naveen, 2026-10-11): an admin sees exactly what they
  // bought, like any member — "I bought Semester 4 and can open everything"
  // made the paywall look broken. Staff check content in UHN /admin/cns.
  if (!profile) return { ...NONE, buyUrl };

  let accessQuery = supabase
    .from("qbank_access")
    .select("semester, expires_at")
    .eq("user_id", profile.id)
    .eq("institution", institution)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString());
  if (course) accessQuery = accessQuery.eq("course", course);
  const { data: rows } = await accessQuery;
  const live = rows ?? [];
  return {
    all: live.some((r) => r.semester == null),
    semesters: new Set(live.filter((r) => r.semester != null).map((r) => r.semester as number)),
    expiresAt: live.length ? live.map((r) => r.expires_at as string).sort()[live.length - 1] : null,
    buyUrl,
  };
});

export function canOpenSemester(a: BankAccess, semester: number | null | undefined): boolean {
  if (a.all) return true;
  return semester != null && a.semesters.has(semester);
}

export function hasAnyAccess(a: BankAccess): boolean {
  return a.all || a.semesters.size > 0;
}

/**
 * Free samples (Naveen, 2026-10-13): a semester the member hasn't bought opens
 * in sample mode — 10 fixed questions with answers and a way to buy — when the
 * bank is on sale. A bank that isn't on sale stays closed.
 */
export function canSample(a: BankAccess): boolean {
  return a.buyUrl != null;
}

/** "full" = bought, "sample" = the free 10, never a redirect. Pages fetch accordingly. */
export async function semesterMode(institution: string, course: string, semester: number) {
  const a = await getBankAccess(institution, course);
  if (canOpenSemester(a, semester)) return { access: a, mode: "full" as const };
  if (canSample(a)) return { access: a, mode: "sample" as const };
  redirect(`/question-bank/${institution}/${course}?locked=${semester}`);
}

/** Bounce to the semester picker (which offers the purchase) unless this semester is open. */
export async function requireSemester(institution: string, course: string, semester: number) {
  const a = await getBankAccess(institution, course);
  if (!canOpenSemester(a, semester)) redirect(`/question-bank/${institution}/${course}?locked=${semester}`);
  return a;
}

/**
 * Opening the bank IS the delivery (Naveen, 2026-10-17): the buyer's paid
 * question-bank orders for it are marked received, so HUB's order page needs
 * no "Confirm received" button. Only orders still open (not completed, not
 * disputed or cancelled) change; one write, and a no-op once done. Never
 * throws — a failure must not stop the bank opening.
 */
export async function markQbankOrdersOpened(userId: string | null, institution: string, access: BankAccess): Promise<void> {
  if (!userId || !hasAnyAccess(access)) return;
  try {
    const at = new Date().toISOString();
    const { error } = await createAdminClient()
      .from("orders")
      .update({ fulfillment_status: "completed", completed_at: at, updated_at: at })
      .eq("buyer_id", userId)
      .eq("status", "paid")
      .eq("buyer_fields->>product", "qbank")
      .eq("buyer_fields->>institution", institution)
      .in("fulfillment_status", ["arranging", "shipped"]);
    if (error) console.error("[qbank] mark opened failed:", error.message);
  } catch (err) {
    console.error("[qbank] mark opened failed:", (err as Error).message);
  }
}

/** "31 Dec 2029" in Indian time. */
export function accessDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
}

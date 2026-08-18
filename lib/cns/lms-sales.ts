import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Instructor sales — read-only, and every figure comes from a real order.
 *
 * WHY THE NUMBERS ARE READ, NOT COMPUTED
 * --------------------------------------
 * It would be easy to show "price × sales × 95%". That number would be wrong
 * the first time a learner used a promo code, bought during a sale window, or
 * got a partial refund. So nothing here multiplies a list price: revenue is
 * `orders.amount_total`, UNN's cut is `orders.platform_fee`, and refunds are
 * `orders.amount_refunded` — the amounts actually charged and actually taken.
 *
 * An instructor looking at this screen is looking at their income. It should
 * match their bank statement, not an estimate.
 *
 * WHY SERVICE ROLE
 * ----------------
 * `orders` is HUB's table and its RLS is written around HUB's own screens. The
 * seller scope is applied here explicitly — every query is filtered to
 * `seller_id = <this instructor's user id>`, established from the session, not
 * from anything the client sent.
 */

export type SaleRow = {
  orderId: string;
  courseId: string | null;
  courseTitle: string;
  buyerName: string;
  grossCents: number;
  feeCents: number;
  refundedCents: number;
  netCents: number;
  status: string;
  payoutStatus: string | null;
  paidAt: string | null;
};

export type CourseSales = {
  courseId: string;
  title: string;
  slug: string;
  status: string;
  price: number;
  enrollments: number;
  sales: number;
  grossCents: number;
  netCents: number;
  refundedCents: number;
  ratingAvg: number | null;
  ratingCount: number;
  listed: boolean;
};

export type SalesSummary = {
  grossCents: number;
  feeCents: number;
  refundedCents: number;
  netCents: number;
  /** Earned but still inside the refund window — not yet transferred. */
  heldCents: number;
  /** Transferred, or on its way. */
  releasedCents: number;
  salesCount: number;
  refundCount: number;
  learners: number;
  courses: CourseSales[];
  recent: SaleRow[];
};

/** Net to the instructor on one order: what was charged, less UNN's cut and refunds. */
function netOf(o: { amount_total?: number | null; platform_fee?: number | null; amount_refunded?: number | null }) {
  return Math.max(
    0,
    (o.amount_total ?? 0) - (o.platform_fee ?? 0) - (o.amount_refunded ?? 0),
  );
}

export async function getInstructorSales(instructorId: string): Promise<SalesSummary | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // The instructor's own courses. RLS already scopes this to the owner.
  const { data: courseRows } = await supabase
    .from("lms_courses")
    .select(
      "id, title, slug, status, price, enrollment_count, rating_avg, rating_count, listing_id",
    )
    .eq("instructor_id", instructorId);

  const courses = (courseRows ?? []) as {
    id: string;
    title: string;
    slug: string;
    status: string;
    price: number;
    enrollment_count: number;
    rating_avg: number | null;
    rating_count: number;
    listing_id: string | null;
  }[];
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const listingIds = courses.map((c) => c.listing_id).filter(Boolean) as string[];

  const admin = createAdminClient();

  // Orders for this seller that are course sales. Matched by listing, because
  // a course is sold AS a marketplace listing — `seller_id` alone would also
  // sweep in any physical goods the same person sells.
  const { data: orderRows } = listingIds.length
    ? await admin
        .from("orders")
        .select(
          "id, listing_id, buyer_id, amount_total, platform_fee, amount_refunded, status, payout_status, paid_at",
        )
        .eq("seller_id", user.id)
        .in("listing_id", listingIds)
        .in("status", ["paid", "completed", "refunded"])
        .order("paid_at", { ascending: false })
    : { data: [] };

  const orders = (orderRows ?? []) as unknown as {
    id: string;
    listing_id: string;
    buyer_id: string;
    amount_total: number;
    platform_fee: number;
    amount_refunded: number;
    status: string;
    payout_status: string | null;
    paid_at: string | null;
  }[];

  const courseByListing = new Map(
    courses.filter((c) => c.listing_id).map((c) => [c.listing_id as string, c]),
  );

  // Buyer names need a table this instructor cannot read directly.
  const buyerIds = Array.from(new Set(orders.map((o) => o.buyer_id)));
  const { data: buyers } = buyerIds.length
    ? await admin.from("users").select("id, full_name").in("id", buyerIds)
    : { data: [] };
  const nameById = new Map(
    ((buyers ?? []) as { id: string; full_name: string | null }[]).map((b) => [
      b.id,
      b.full_name ?? "UNN member",
    ]),
  );

  const perCourse = new Map<string, { sales: number; gross: number; net: number; refunded: number }>();
  let grossCents = 0;
  let feeCents = 0;
  let refundedCents = 0;
  let heldCents = 0;
  let releasedCents = 0;
  let refundCount = 0;

  const recent: SaleRow[] = orders.map((o) => {
    const course = courseByListing.get(o.listing_id);
    const net = netOf(o);

    grossCents += o.amount_total ?? 0;
    feeCents += o.platform_fee ?? 0;
    refundedCents += o.amount_refunded ?? 0;
    if ((o.amount_refunded ?? 0) > 0) refundCount++;

    // 'held' is the escrow state: earned, but inside the refund window and not
    // yet transferred. Anything else that has money attached has been released.
    if (o.payout_status === "held") heldCents += net;
    else releasedCents += net;

    if (course) {
      const agg = perCourse.get(course.id) ?? { sales: 0, gross: 0, net: 0, refunded: 0 };
      agg.sales += 1;
      agg.gross += o.amount_total ?? 0;
      agg.net += net;
      agg.refunded += o.amount_refunded ?? 0;
      perCourse.set(course.id, agg);
    }

    return {
      orderId: o.id,
      courseId: course?.id ?? null,
      courseTitle: course?.title ?? "Course",
      buyerName: nameById.get(o.buyer_id) ?? "UNN member",
      grossCents: o.amount_total ?? 0,
      feeCents: o.platform_fee ?? 0,
      refundedCents: o.amount_refunded ?? 0,
      netCents: net,
      status: o.status,
      payoutStatus: o.payout_status,
      paidAt: o.paid_at,
    };
  });

  const courseSales: CourseSales[] = courses
    .map((c) => {
      const agg = perCourse.get(c.id) ?? { sales: 0, gross: 0, net: 0, refunded: 0 };
      return {
        courseId: c.id,
        title: c.title,
        slug: c.slug,
        status: c.status,
        price: c.price ?? 0,
        enrollments: c.enrollment_count ?? 0,
        sales: agg.sales,
        grossCents: agg.gross,
        netCents: agg.net,
        refundedCents: agg.refunded,
        ratingAvg: c.rating_avg,
        ratingCount: c.rating_count ?? 0,
        listed: !!c.listing_id,
      };
    })
    .sort((a, b) => b.netCents - a.netCents || b.enrollments - a.enrollments);

  return {
    grossCents,
    feeCents,
    refundedCents,
    netCents: Math.max(0, grossCents - feeCents - refundedCents),
    heldCents,
    releasedCents,
    salesCount: orders.length,
    refundCount,
    learners: courses.reduce((n, c) => n + (c.enrollment_count ?? 0), 0),
    courses: courseSales,
    recent: recent.slice(0, 25),
  };
}

/** Is this instructor able to be paid, and have they signed? Drives the banner. */
export async function getSellerReadiness(): Promise<{
  agreementAccepted: boolean;
  payoutsConnected: boolean;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { agreementAccepted: false, payoutsConnected: false };

  const [{ data: instructor }, { data: account }] = await Promise.all([
    supabase
      .from("lms_instructors")
      .select("agreement_accepted_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    createAdminClient()
      .from("stripe_accounts")
      .select("payouts_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return {
    agreementAccepted: !!instructor?.agreement_accepted_at,
    // Matches the gate in HUB syncCourseListing and the check in
    // startListingCheckout: what matters is being able to RECEIVE money.
    payoutsConnected: !!account?.payouts_enabled,
  };
}

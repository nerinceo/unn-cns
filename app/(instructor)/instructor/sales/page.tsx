import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  ExternalLink,
  Receipt,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { getMyInstructor } from "@/lib/cns/lms";
import { getInstructorSales, getSellerReadiness } from "@/lib/cns/lms-sales";
import { INSTRUCTOR_SHARE_PERCENT } from "@/lib/lms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales — Central Nursing Systems" };

const HUB_URL = (process.env.NEXT_PUBLIC_HUB_URL ?? "https://unn.nerusalem.com").replace(
  /\/+$/,
  "",
);

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  paid: { text: "Paid", className: "bg-emerald-50 text-emerald-700" },
  completed: { text: "Completed", className: "bg-emerald-50 text-emerald-700" },
  refunded: { text: "Refunded", className: "bg-red-50 text-red-700" },
};

export default async function InstructorSalesPage() {
  const instructor = await getMyInstructor();
  if (!instructor || instructor.status !== "approved") notFound();

  const [sales, readiness] = await Promise.all([
    getInstructorSales(instructor.id),
    getSellerReadiness(),
  ]);
  if (!sales) notFound();

  const stats = [
    { label: "Net earnings", value: usd(sales.netCents), icon: Wallet, hint: "after UNN's cut and refunds" },
    { label: "Gross sales", value: usd(sales.grossCents), icon: TrendingUp, hint: `${sales.salesCount} orders` },
    { label: "Awaiting payout", value: usd(sales.heldCents), icon: Receipt, hint: "inside the refund window" },
    { label: "Learners", value: String(sales.learners), icon: Users, hint: "across all courses" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Sales</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every figure here is what was actually charged and actually paid — not an estimate.
          </p>
        </div>
        <a
          href={`${HUB_URL}/orders`}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <ExternalLink className="h-4 w-4" />
          Payouts on UNN
        </a>
      </header>

      {/* The two gates that stop a course selling, surfaced where the money is. */}
      {(!readiness.agreementAccepted || !readiness.payoutsConnected) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold">Your courses can&apos;t be sold yet</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                {!readiness.agreementAccepted && (
                  <li>
                    You haven&apos;t accepted the Instructor Agreement.{" "}
                    <Link
                      href="/instructor/settings?tab=agreement"
                      className="font-medium underline"
                    >
                      Review and accept it
                    </Link>
                  </li>
                )}
                {!readiness.payoutsConnected && (
                  <li>
                    Payouts aren&apos;t connected, so a paid course can&apos;t be listed.{" "}
                    <a href={`${HUB_URL}/api/stripe/connect`} className="font-medium underline">
                      Set up payments with Stripe
                    </a>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <s.icon className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
            <p className="text-lg font-semibold tabular-nums">{s.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{s.hint}</p>
          </div>
        ))}
      </div>

      {/* The full arithmetic, so nothing about the payout is a mystery. */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Where the money went</h2>
        <dl className="space-y-2 text-sm">
          <Row label="Gross sales" value={usd(sales.grossCents)} />
          <Row
            label={`UNN platform fee (${100 - INSTRUCTOR_SHARE_PERCENT}%)`}
            value={`− ${usd(sales.feeCents)}`}
          />
          <Row
            label={`Refunds${sales.refundCount ? ` (${sales.refundCount})` : ""}`}
            value={`− ${usd(sales.refundedCents)}`}
          />
          <div className="border-t border-border pt-2">
            <Row label="Your net earnings" value={usd(sales.netCents)} bold />
          </div>
        </dl>
        <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Released to you</p>
            <p className="text-sm font-medium tabular-nums">{usd(sales.releasedCents)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Held until the refund window closes</p>
            <p className="text-sm font-medium tabular-nums">{usd(sales.heldCents)}</p>
          </div>
        </div>
      </div>

      {/* Per course */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">By course</h2>
        {sales.courses.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No courses yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Course</th>
                  <th className="px-4 py-2.5 font-medium">Price</th>
                  <th className="px-4 py-2.5 font-medium">Sales</th>
                  <th className="px-4 py-2.5 font-medium">Learners</th>
                  <th className="px-4 py-2.5 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sales.courses.map((c) => (
                  <tr key={c.courseId}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/instructor/courses/${c.courseId}`}
                        className="font-medium transition-colors hover:text-primary"
                      >
                        {c.title}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {c.status === "approved" && c.listed ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <ShoppingBag className="h-3 w-3" />
                            On sale
                          </span>
                        ) : (
                          <span className="capitalize">{c.status.replace("_", " ")}</span>
                        )}
                        {c.ratingCount > 0 && ` · ${c.ratingAvg?.toFixed(1)} (${c.ratingCount})`}
                      </p>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {c.price > 0 ? `$${c.price}` : "Free"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{c.sales}</td>
                    <td className="px-4 py-3 tabular-nums">{c.enrollments}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {usd(c.netCents)}
                      {c.refundedCents > 0 && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] font-normal text-red-600">
                          <RotateCcw className="h-3 w-3" />
                          {usd(c.refundedCents)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent orders */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">Recent sales</h2>
        {sales.recent.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <Receipt className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="mb-1 text-sm font-medium">No sales yet</p>
            <p className="text-sm text-muted-foreground">
              Once a course is approved it goes on sale automatically, and orders show up here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Course</th>
                  <th className="px-4 py-2.5 font-medium">Buyer</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Gross</th>
                  <th className="px-4 py-2.5 text-right font-medium">You earn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sales.recent.map((r) => {
                  const badge = STATUS_LABEL[r.status] ?? {
                    text: r.status,
                    className: "bg-muted text-muted-foreground",
                  };
                  return (
                    <tr key={r.orderId}>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {r.paidAt
                          ? new Date(r.paidAt).toLocaleDateString(undefined, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3">{r.courseTitle}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.buyerName}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                        >
                          {badge.text}
                        </span>
                        {r.payoutStatus === "held" && (
                          <span className="ml-1.5 text-[11px] text-muted-foreground">held</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{usd(r.grossCents)}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {usd(r.netCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={bold ? "font-medium" : "text-muted-foreground"}>{label}</dt>
      <dd className={`tabular-nums ${bold ? "text-base font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

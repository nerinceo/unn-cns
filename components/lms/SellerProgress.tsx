import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Clock, ShoppingBag } from "lucide-react";
import type { SellerStep } from "@/lib/lms";

/**
 * "What's left before you can sell", as one bar and a checklist.
 *
 * Built from the same sellerReadiness() the settings page and the sales page
 * read, so the three can never disagree about what is outstanding.
 *
 * Every incomplete step carries a link to the exact place that resolves it. A
 * checklist that tells someone they're blocked without telling them where to go
 * is just a nag.
 */
const WHERE_HREF: Record<SellerStep["where"], string | null> = {
  profile: "/instructor/settings?tab=profile",
  credentials: "/instructor/settings?tab=credentials",
  agreement: "/instructor/settings?tab=agreement",
  payouts: "/instructor/settings?tab=payouts",
  courses: "/instructor",
  // Nothing the instructor can click — it is staff's move.
  review: null,
};

export function SellerProgress({
  steps,
  percent,
  doneCount,
  canSell,
}: {
  steps: SellerStep[];
  percent: number;
  doneCount: number;
  canSell: boolean;
}) {
  if (canSell && percent === 100) {
    return (
      <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold text-emerald-900">Your account is ready to sell</p>
          <p className="mt-0.5 text-xs text-emerald-800">
            Approved courses go on sale in the UNN marketplace automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {canSell ? "Finish your profile" : "Before you can sell"}
        </h2>
        <p className="text-xs tabular-nums text-muted-foreground">
          {doneCount} of {steps.length} · {percent}%
        </p>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {canSell
          ? "You can sell already — these are the bits that make your profile look finished to a buyer."
          : "Complete these and your approved courses go on sale automatically."}
      </p>

      <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="space-y-2.5">
        {steps.map((s) => {
          const href = WHERE_HREF[s.where];
          const blocking = s.blocksSelling && !s.done;

          return (
            <li key={s.key} className="flex items-start gap-2.5">
              {s.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : s.where === "review" ? (
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={`text-sm ${
                      s.done ? "text-muted-foreground line-through" : "font-medium"
                    }`}
                  >
                    {s.label}
                  </p>
                  {blocking && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      Blocks selling
                    </span>
                  )}
                </div>

                {!s.done && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {s.detail}
                    {s.where === "review" && " Nothing to do — we'll email you."}
                  </p>
                )}
              </div>

              {!s.done && href && (
                <Link
                  href={href}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary transition-opacity hover:opacity-80"
                >
                  Fix
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

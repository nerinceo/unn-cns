"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, ShoppingBag, TrendingUp } from "lucide-react";
import { updateCoursePricing, type CourseForEdit } from "@/lib/actions/lms-courses";
import {
  LMS_PRICE_BANDS,
  INSTRUCTOR_SHARE_PERCENT,
  instructorEarnings,
} from "@/lib/lms";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function PricingStep({ course }: { course: CourseForEdit }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [price, setPrice] = useState<number>(course.price ?? 0);
  const [salePrice, setSalePrice] = useState<string>(
    course.sale_price != null ? String(course.sale_price) : "",
  );

  const earnings = instructorEarnings(price);
  const isLive = course.status === "approved";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("price", String(price));
    formData.set("sale_price", salePrice);

    setError(null);
    setSaved(false);
    start(async () => {
      const result = await updateCoursePricing(course.id, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Where the money actually happens. Said plainly so an instructor is not
          hunting CNS for a checkout that lives in another app. */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-card p-4">
        <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Your course is sold on the <strong>UNN marketplace</strong>. Set the price here and
          we&apos;ll create the listing for you the moment the course is approved — you
          don&apos;t need to list it yourself.
          {isLive && " Changing the price updates the live listing straight away."}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Price</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Fixed price points keep the catalogue coherent. UNN will never discount your course
          without your say-so.
        </p>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {LMS_PRICE_BANDS.map((band) => {
            const active = price === band;
            return (
              <button
                key={band}
                type="button"
                onClick={() => setPrice(band)}
                className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                {band === 0 ? "Free" : `$${band}`}
              </button>
            );
          })}
        </div>
      </div>

      {price > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-2.5">
            <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-900">
                You earn ${earnings.toFixed(2)} per sale
              </p>
              <p className="mt-1 text-xs text-emerald-800">
                That&apos;s {INSTRUCTOR_SHARE_PERCENT}% of ${price}. For comparison, Udemy pays
                its instructors 37% on an organic sale.
              </p>
              <p className="mt-2 text-[11px] text-emerald-700">
                An estimate at list price. Your dashboard shows what each sale actually paid,
                after any promo code and before refunds.
              </p>
            </div>
          </div>
        </div>
      )}

      {price > 0 && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div>
            <h2 className="mb-1 text-sm font-semibold">Sale price</h2>
            <p className="text-xs text-muted-foreground">
              Optional, and entirely yours to set. Leave it empty for no sale.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium">Sale price</label>
              <select
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className={field}
              >
                <option value="">No sale</option>
                {LMS_PRICE_BANDS.filter((b) => b > 0 && b < price).map((b) => (
                  <option key={b} value={b}>
                    ${b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">Starts</label>
              <input
                type="date"
                name="sale_starts_at"
                defaultValue={course.sale_starts_at?.slice(0, 10) ?? ""}
                disabled={!salePrice}
                className={field}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">Ends</label>
              <input
                type="date"
                name="sale_ends_at"
                defaultValue={course.sale_ends_at?.slice(0, 10) ?? ""}
                disabled={!salePrice}
                className={field}
              />
            </div>
          </div>

          {salePrice && (
            <p className="text-xs text-muted-foreground">
              On sale you earn ${instructorEarnings(Number(salePrice)).toFixed(2)} per sale.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save pricing
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
            <Check className="h-4 w-4" />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}

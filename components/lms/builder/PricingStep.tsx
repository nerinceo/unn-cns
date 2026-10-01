"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, ShoppingBag, TrendingUp } from "lucide-react";
import { updateCoursePricing, type CourseForEdit } from "@/lib/actions/lms-courses";
import {
  MIN_COURSE_PRICE,
  MAX_COURSE_PRICE,
  INSTRUCTOR_SHARE_PERCENT,
  instructorEarnings,
  isValidCoursePrice,
} from "@/lib/lms";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-shadow focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function PricingStep({ course }: { course: CourseForEdit }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Held as strings: a number state cannot represent "24." halfway through
  // typing "24.99", and coercing on every keystroke fights the instructor.
  const [priceText, setPriceText] = useState<string>(
    course.price != null ? String(course.price) : "0",
  );
  const [salePrice, setSalePrice] = useState<string>(
    course.sale_price != null ? String(course.sale_price) : "",
  );

  const price = Number(priceText);
  const priceIsValid = priceText.trim() !== "" && isValidCoursePrice(price);
  const saleNumber = Number(salePrice);
  const saleIsValid =
    salePrice.trim() === "" ||
    (isValidCoursePrice(saleNumber) && saleNumber > 0 && saleNumber < price);

  const earnings = instructorEarnings(priceIsValid ? price : 0);
  const isLive = course.status === "approved";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("price", priceText.trim());
    formData.set("sale_price", salePrice.trim());

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
          Your course is sold on the <strong>Nerusalem marketplace</strong>. Set the price here and
          we&apos;ll create the listing for you the moment the course is approved — you
          don&apos;t need to list it yourself.
          {isLive && " Changing the price updates the live listing straight away."}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Price</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Your course, your price. Enter <strong>0</strong> to make it free, or anything from $
          {MIN_COURSE_PRICE} to ${MAX_COURSE_PRICE}. Nerusalem will never discount your course without
          your say-so.
        </p>

        <div className="flex items-start gap-3">
          <div className="relative w-40">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={MAX_COURSE_PRICE}
              step="0.01"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              aria-label="Course price in US dollars"
              aria-invalid={!priceIsValid}
              className={`${field} pl-6 ${
                priceIsValid ? "" : "border-red-300 focus:border-red-400 focus:ring-red-200"
              }`}
            />
          </div>
          <div className="min-w-0 pt-2">
            {priceIsValid ? (
              <p className="text-xs text-muted-foreground">
                {price === 0
                  ? "Free — anyone enrolled can watch it, and you need no payout account."
                  : `Priced in USD. Learners are charged $${price.toFixed(2)}.`}
              </p>
            ) : (
              <p className="text-xs text-red-600">
                Enter 0 for a free course, or a price between ${MIN_COURSE_PRICE} and $
                {MAX_COURSE_PRICE}, in whole cents.
              </p>
            )}
          </div>
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
              <p className="mt-2 text-[12px] text-emerald-700">
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
              <label className="mb-1.5 block text-xs font-medium" htmlFor="lms-sale-price">
                Sale price
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <input
                  id="lms-sale-price"
                  type="number"
                  inputMode="decimal"
                  min={MIN_COURSE_PRICE}
                  max={MAX_COURSE_PRICE}
                  step="0.01"
                  placeholder="No sale"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  aria-invalid={!saleIsValid}
                  className={`${field} pl-6 ${
                    saleIsValid ? "" : "border-red-300 focus:border-red-400 focus:ring-red-200"
                  }`}
                />
              </div>
              {!saleIsValid && (
                <p className="mt-1 text-xs text-red-600">
                  Must be below the list price, and at least ${MIN_COURSE_PRICE}.
                </p>
              )}
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

          {salePrice && saleIsValid && (
            <p className="text-xs text-muted-foreground">
              On sale you earn ${instructorEarnings(saleNumber).toFixed(2)} per sale.
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
          disabled={pending || !priceIsValid || !saleIsValid}
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

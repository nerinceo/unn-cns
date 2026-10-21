"use client";

import { useEffect, useState } from "react";
import { ShoppingCart, X } from "lucide-react";

// Set once the member closes (or taps through) the tip. Per device,
// deliberately: a tip, not account state.
const KEY = "nrs.tip.qbank-buy.v1";

/**
 * First-visit tip for a member who has bought nothing yet (Naveen,
 * 2026-10-21): where to buy. Once closed, never shown on this device again.
 */
export function BuyTip({ buyUrl }: { buyUrl: string }) {
  const [show, setShow] = useState(false);
  // Read after mount: storage is client-only, and a throwing accessor
  // (private mode, blocked site data) just means no tip.
  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== "1");
    } catch {}
  }, []);
  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  };

  if (!show) return null;
  return (
    <div role="status" className="flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground shadow-card">
      <ShoppingCart className="h-5 w-5 shrink-0" />
      <p className="flex-1 text-[14px] leading-snug">
        <span className="block font-semibold">You&apos;re seeing free samples</span>
        Buy here to unlock every question in your semester.
      </p>
      <a
        href={buyUrl}
        onClick={dismiss}
        className="shrink-0 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-primary hover:bg-white/90"
      >
        Buy here
      </a>
      <button type="button" onClick={dismiss} className="-m-1 shrink-0 rounded-md p-1 hover:bg-white/15" aria-label="Close tip">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

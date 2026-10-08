"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Lock, X } from "lucide-react";

/**
 * TEMPORARY GATE (2026-10-08): the Question Bank is moving behind paid access.
 *
 * Universities stay visible in the directory, but opening one shows this popup
 * instead of navigating. The server half is
 * app/(member)/question-bank/[institution]/layout.tsx, which bounces every deep
 * link back here with `?locked=1` — so `initialOpen` shows the popup straight
 * away rather than leaving the visitor wondering why they landed on the list.
 */
const GateContext = createContext<() => void>(() => {});

export function QuestionBankPaidGate({
  initialOpen,
  children,
}: {
  initialOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  const router = useRouter();
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    // Drop ?locked=1 so a refresh doesn't reopen the popup.
    if (initialOpen) router.replace(pathname, { scroll: false });
  }, [initialOpen, pathname, router]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <GateContext.Provider value={() => setOpen(true)}>
      {children}

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qb-paid-title"
        >
          <div className="absolute inset-0 bg-foreground/20" onClick={close} />
          <div className="relative w-full max-w-md animate-fade-up rounded-2xl border border-border bg-white p-6 shadow-popover sm:p-7">
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>

            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <Lock className="h-6 w-6" />
            </span>
            <p className="mt-4 text-[12px] font-bold uppercase tracking-wider text-primary">
              Paid access
            </p>
            <h2 id="qb-paid-title" className="mt-1 text-xl font-bold tracking-tight">
              This question bank is a paid listing
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
              University question banks, with answers and model answers, are moving to paid
              access. Purchasing opens here soon. Until then, you can browse every university
              in the directory.
            </p>

            <div className="mt-6 flex justify-end">
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Back to universities
              </button>
            </div>
          </div>
        </div>
      )}
    </GateContext.Provider>
  );
}

/** A bank card that opens the paid-access popup instead of the bank. */
export function PaidBankTrigger({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const openGate = useContext(GateContext);
  return (
    <button type="button" onClick={openGate} className={`${className ?? ""} text-left`}>
      {children}
    </button>
  );
}

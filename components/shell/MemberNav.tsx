"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { MEMBER_PRIMARY, MEMBER_MORE, MORE_ICON, type NavItem } from "./nav";

/**
 * Member navigation for the CNS brief: a wide top bar on desktop/iPad, a bottom
 * tab bar on mobile. Primary items sit inline; the rest live behind "More".
 *
 * A route counts as active on an exact match or as a prefix (so /jobs/123 keeps
 * Jobs lit), except "/" which must match exactly or it lights up everywhere.
 */
function useActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

const moreIsActive = (pathname: string) =>
  MEMBER_MORE.some((m) => pathname === m.href || pathname.startsWith(`${m.href}/`));

// ---------------------------------------------------------------------------
// Desktop / iPad — horizontal bar with a More dropdown
// ---------------------------------------------------------------------------
export function MemberTopNav() {
  const isActive = useActive();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the dropdown on any navigation.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <nav className="hidden border-b border-border bg-card md:block">
      <div className="mx-auto flex max-w-[1440px] items-center gap-1 px-6">
        {MEMBER_PRIMARY.map((item) => (
          <TopLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm transition-colors",
              open || moreIsActive(pathname)
                ? "border-primary font-medium text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <MORE_ICON className="h-4 w-4" />
            More
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
              <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-lg border border-border bg-card p-1.5 shadow-lg">
                {MEMBER_MORE.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      isActive(href)
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function TopLink({ item, active }: { item: NavItem; active: boolean }) {
  const { href, label, icon: Icon } = item;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm transition-colors",
        active
          ? "border-primary font-medium text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Mobile — bottom tab bar with a More sheet
// ---------------------------------------------------------------------------
export function MemberBottomNav() {
  const isActive = useActive();
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);

  useEffect(() => setSheet(false), [pathname]);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card md:hidden">
        <ul className="flex">
          {MEMBER_PRIMARY.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2 text-[11px] transition-colors",
                    active ? "font-medium text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              onClick={() => setSheet(true)}
              className={cn(
                "flex w-full flex-col items-center gap-1 py-2 text-[11px] transition-colors",
                moreIsActive(pathname) ? "font-medium text-primary" : "text-muted-foreground"
              )}
            >
              <MORE_ICON className="h-5 w-5" />
              More
            </button>
          </li>
        </ul>
      </nav>

      {sheet && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-foreground/20" onClick={() => setSheet(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card p-4 pb-8">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">More</p>
              <button onClick={() => setSheet(false)} aria-label="Close" className="text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MEMBER_MORE.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
                >
                  <Icon className="h-5 w-5 text-primary" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

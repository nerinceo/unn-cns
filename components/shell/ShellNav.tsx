"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  MEMBER_PRIMARY,
  MEMBER_MORE,
  PROFESSIONAL_PRIMARY,
  ADMIN_NAV,
  INSTRUCTOR_NAV,
  MORE_ICON,
  employerNav,
  type NavItem,
} from "./nav";

/**
 * CNS navigation: inline in the header on desktop, a bottom tab bar below lg.
 *
 * No sidebar, deliberately. CNS borrows HUB's surfaces (frosted header, flat
 * cards, type scale) but not its rail — CNS is a browse experience with a
 * short nav, and a full-height rail spent ~250px of every page on four links.
 *
 * Built HERE, on the client, from a portal key. Nav items carry Lucide icons,
 * which are functions and cannot cross the server/client boundary, so AppShell
 * sends plain strings and this module resolves them against nav.ts.
 */
export type PortalKey = "member" | "employer" | "admin" | "instructor";

/**
 * What sits in the bar and what goes behind "More" — the same split on desktop
 * and mobile, so the two never disagree about where something lives.
 *
 * The member nav names its own split (primary vs More). Any other portal shows
 * everything when it fits in five, otherwise four plus More.
 */
function splitFor(
  portal: PortalKey,
  employerId: string | undefined,
  professional: boolean
): { primary: NavItem[]; more: NavItem[] } {
  if (portal === "member") {
    // A professional has no More at all — everything behind it is nursing
    // curriculum, and middleware would bounce them straight back out.
    return professional
      ? { primary: PROFESSIONAL_PRIMARY, more: [] }
      : { primary: MEMBER_PRIMARY, more: MEMBER_MORE };
  }
  const all =
    portal === "admin"
      ? ADMIN_NAV
      : portal === "instructor"
        ? INSTRUCTOR_NAV
        : employerId
          ? employerNav(employerId)
          : [];
  return all.length <= 5 ? { primary: all, more: [] } : { primary: all.slice(0, 4), more: all.slice(4) };
}

/**
 * Exact match for a portal root (and "/"), prefix match otherwise — a prefix
 * match on the root would light up every item at once, while /jobs/123 must
 * keep Jobs lit.
 */
function useIsActive(rootHref: string | undefined) {
  const pathname = usePathname();
  return (href: string) =>
    href === "/" || href === rootHref
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
}

type NavProps = { portal: PortalKey; employerId?: string; professional?: boolean };

// ---------------------------------------------------------------------------
// Desktop — inline in the header, lg and up.
// ---------------------------------------------------------------------------
export function HeaderNav({ portal, employerId, professional = false }: NavProps) {
  const { primary, more } = splitFor(portal, employerId, professional);
  const isActive = useIsActive(primary[0]?.href);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = more.some((m) => isActive(m.href));

  useEffect(() => setOpen(false), [pathname]);

  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
      {primary.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-colors",
              active
                ? "bg-primary/[0.08] font-semibold text-primary"
                : "font-medium text-foreground hover:bg-muted"
            )}
          >
            <Icon
              className={cn(
                "h-[1.15rem] w-[1.15rem] shrink-0 transition-colors",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
            {label}
          </Link>
        );
      })}

      {more.length > 0 ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="menu"
            className={cn(
              "group flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-colors",
              open || moreActive
                ? "bg-primary/[0.08] font-semibold text-primary"
                : "font-medium text-foreground hover:bg-muted"
            )}
          >
            <MORE_ICON
              className={cn(
                "h-[1.15rem] w-[1.15rem] shrink-0",
                open || moreActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
            More
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div
                role="menu"
                className="absolute left-0 top-full z-50 mt-2 w-64 animate-fade-up overflow-hidden rounded-xl border border-border bg-white p-1.5 shadow-popover"
              >
                {more.map(({ href, label, icon: Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      role="menuitem"
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        active
                          ? "bg-primary/[0.08] font-semibold text-primary"
                          : "font-medium text-foreground hover:bg-muted"
                      )}
                    >
                      <Icon className={cn("h-[1.15rem] w-[1.15rem] shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : null}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Mobile and tablet — bottom tab bar, with a More sheet when the nav is long.
// ---------------------------------------------------------------------------
export function BottomNav({ portal, employerId, professional = false }: NavProps) {
  const { primary, more } = splitFor(portal, employerId, professional);
  const isActive = useIsActive(primary[0]?.href);
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);
  const moreActive = more.some((m) => isActive(m.href));

  useEffect(() => setSheet(false), [pathname]);

  return (
    <>
      {/* aria-label is load-bearing: globals.css gives exactly this nav HUB's
          frosted bottom-bar treatment. */}
      <nav
        aria-label="Mobile navigation"
        className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white lg:hidden"
      >
        <ul className="flex h-16 items-stretch justify-around px-1">
          {primary.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-[1.375rem] w-[1.375rem]" />
                  <span className="max-w-full truncate px-1">{label}</span>
                </Link>
              </li>
            );
          })}
          {more.length > 0 ? (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setSheet(true)}
                aria-expanded={sheet}
                className={cn(
                  "flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors",
                  moreActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <MORE_ICON className="h-[1.375rem] w-[1.375rem]" />
                More
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      {sheet && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="More">
          <div className="absolute inset-0 bg-foreground/20" onClick={() => setSheet(false)} />
          <div className="safe-bottom absolute inset-x-0 bottom-0 animate-fade-up rounded-t-2xl border-t border-border bg-white p-4 pb-8 shadow-popover">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-semibold">More</p>
              <button
                type="button"
                onClick={() => setSheet(false)}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {more.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border px-2 py-4 text-sm font-medium transition-colors",
                    isActive(href)
                      ? "border-primary/40 bg-brand-50 text-primary"
                      : "border-border text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-6 w-6 text-primary" />
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

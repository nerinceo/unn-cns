"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { hubLink } from "@/lib/hub";
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
 * The CNS rail and the mobile bottom bar — HUB's shell, CNS's destinations.
 *
 * Built HERE, on the client, from a portal key. Nav items carry Lucide icons,
 * which are functions and cannot cross the server/client boundary, so AppShell
 * sends plain strings and this module resolves them against nav.ts.
 *
 * The geometry and class strings follow HUB's LeftSidebar and MobileNav
 * (unn-platform/components/platform/) so moving between the two apps does not
 * feel like leaving the product. The rail's widths must match the header's
 * logo slot in AppShell, or the rail edge jogs where the two meet.
 */
export type PortalKey = "member" | "employer" | "admin" | "instructor";

type Section = { label?: string; items: NavItem[] };

function sectionsFor(portal: PortalKey, employerId: string | undefined, professional: boolean): Section[] {
  if (portal === "admin") return [{ items: ADMIN_NAV }];
  if (portal === "instructor") return [{ items: INSTRUCTOR_NAV }];
  if (portal === "employer" && employerId) return [{ items: employerNav(employerId) }];
  // A professional has no "Explore" group at all — everything in it is nursing
  // curriculum, and middleware would bounce them straight back out.
  if (professional) return [{ items: PROFESSIONAL_PRIMARY }];
  return [{ items: MEMBER_PRIMARY }, { label: "Explore", items: MEMBER_MORE }];
}

/**
 * Exact match for a portal root (and "/"), prefix match otherwise — a prefix
 * match on the root would light up every item at once, while /jobs/123 must
 * keep Jobs lit.
 */
function useIsActive(sections: Section[]) {
  const pathname = usePathname();
  const rootHref = sections[0]?.items[0]?.href;
  return (href: string) =>
    href === "/" || href === rootHref
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
}

// ---------------------------------------------------------------------------
// Desktop — the rail. lg and up; below that the bottom bar takes over.
// ---------------------------------------------------------------------------
export function Rail({
  portal,
  employerId,
  professional = false,
}: {
  portal: PortalKey;
  employerId?: string;
  professional?: boolean;
}) {
  const sections = sectionsFor(portal, employerId, professional);
  const isActive = useIsActive(sections);

  return (
    // Flush to the viewport edge, full height under the sticky header, its own
    // surface. `top-14 sm:top-16` and the matching heights are the header's.
    <aside className="unn-rail-edge sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col bg-white sm:top-16 sm:h-[calc(100dvh-4rem)] lg:flex lg:w-60 xl:w-64 2xl:w-72">
      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section, i) => (
          <div key={section.label ?? i} className={cn(i > 0 && "mt-6")}>
            {section.label ? (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {section.label}
              </p>
            ) : null}
            <ul className="space-y-1">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "unn-nav-item group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                        active
                          ? "unn-nav-item-active font-semibold text-primary"
                          : "font-medium text-foreground hover:bg-muted"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-[1.2rem] w-[1.2rem] shrink-0 transition-colors",
                          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                      <span className="truncate">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* The way back. HUB's rail carries a CNS card; this is its mirror. A
          professional's HUB home is /pro, not the nurse /home. */}
      <div className="shrink-0 border-t border-border p-3">
        <a
          href={hubLink(professional ? "/pro" : "/home")}
          className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowUpRight className="h-[1.2rem] w-[1.2rem] shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          <span className="truncate">Back to Nerusalem</span>
        </a>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Mobile and tablet — bottom tab bar, with a More sheet when the nav is long.
// ---------------------------------------------------------------------------

/**
 * What fits on the bar. The member nav already names its split (primary vs
 * Explore). Any other portal shows everything when it fits in five tabs and
 * otherwise four plus More — the old bar sliced at five and silently dropped
 * the admin portal's sixth item on a phone.
 */
function mobileSplit(sections: Section[]): { primary: NavItem[]; more: NavItem[] } {
  if (sections.length > 1) {
    return { primary: sections[0].items, more: sections.slice(1).flatMap((s) => s.items) };
  }
  const all = sections[0]?.items ?? [];
  return all.length <= 5 ? { primary: all, more: [] } : { primary: all.slice(0, 4), more: all.slice(4) };
}

export function BottomNav({
  portal,
  employerId,
  professional = false,
}: {
  portal: PortalKey;
  employerId?: string;
  professional?: boolean;
}) {
  const sections = sectionsFor(portal, employerId, professional);
  const isActive = useIsActive(sections);
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);
  const { primary, more } = mobileSplit(sections);
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

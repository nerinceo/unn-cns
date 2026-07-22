"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { MEMBER_NAV, ADMIN_NAV, employerNav, type NavItem } from "./nav";

/**
 * Nav is built HERE, on the client, from a portal key.
 *
 * It cannot be passed down from AppShell as props: each item carries a Lucide
 * icon, which is a function, and React cannot serialise functions across the
 * server/client boundary ("Functions cannot be passed directly to Client
 * Components"). So the server sends two plain strings and this module resolves
 * them against the same nav definitions.
 */
export type PortalKey = "member" | "employer" | "admin";

function navFor(portal: PortalKey, employerId?: string): NavItem[] {
  if (portal === "admin") return ADMIN_NAV;
  if (portal === "employer" && employerId) return employerNav(employerId);
  return MEMBER_NAV;
}

/**
 * Exact match for a portal root, prefix match otherwise — a prefix match on the
 * root would light up every item at once.
 */
function useIsActive(items: NavItem[]) {
  const pathname = usePathname();
  const rootHref = items[0]?.href;
  return (href: string) => {
    if (href === "/" || href === rootHref) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };
}

export function SideNav({ portal, employerId }: { portal: PortalKey; employerId?: string }) {
  const items = navFor(portal, employerId);
  const isActive = useIsActive(items);

  return (
    <nav className="hidden w-56 shrink-0 md:block">
      <ul className="sticky top-20 space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary font-medium text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileNav({ portal, employerId }: { portal: PortalKey; employerId?: string }) {
  const items = navFor(portal, employerId);
  const isActive = useIsActive(items);
  const shown = items.slice(0, 5);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card md:hidden">
      <ul className="flex">
        {shown.map(({ href, label, icon: Icon }) => {
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
                <span className="max-w-full truncate px-1">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

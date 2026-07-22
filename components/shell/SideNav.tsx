"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import type { NavItem } from "./nav";

/**
 * Active-state matching.
 *
 * Exact match for a portal root ("/" or "/employer/<id>"), prefix match
 * otherwise — a prefix match on the root would light up every item at once.
 */
function isActive(pathname: string, href: string, items: NavItem[]) {
  const isRoot = href === "/" || items.every((i) => i.href === href || !href.startsWith(i.href));
  const rootHrefs = new Set(["/", items[0]?.href]);
  if (rootHrefs.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="hidden w-56 shrink-0 md:block">
      <ul className="sticky top-20 space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href, items);
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

export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const shown = items.slice(0, 5);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card md:hidden">
      <ul className="flex">
        {shown.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href, items);
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

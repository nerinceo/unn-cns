"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { CNS_NAV } from "./CnsSidebar";

/** Bottom bar for small screens. Consumes the same CNS_NAV as the sidebar. */
export function CnsMobileNav() {
  const pathname = usePathname();
  const items = CNS_NAV.filter((i) => i.href !== "/progress");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card md:hidden">
      <ul className="flex">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[11px] transition-colors",
                  active ? "text-primary font-medium" : "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

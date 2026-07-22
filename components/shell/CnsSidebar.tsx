"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  Briefcase,
  Library,
  TrendingUp,
  Home,
  FileText,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Single source of truth for CNS navigation.
 *
 * HUB defines its nav three separate times (LeftSidebar, MobileNav,
 * AdminPortalNav) and they have already diverged. CNS starts with one exported
 * array that every surface consumes, so that cannot happen here.
 */
export const CNS_NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/learn", label: "Learn", icon: BookOpen },
  { href: "/question-bank", label: "Question Bank", icon: ClipboardList },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/employer", label: "For Employers", icon: Building2 },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/library", label: "My Library", icon: Library },
  { href: "/progress", label: "Progress", icon: TrendingUp },
] as const;

export function CnsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-56 shrink-0 md:block">
      <ul className="sticky top-20 space-y-1">
        {CNS_NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground font-medium"
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

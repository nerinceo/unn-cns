import Link from "next/link";
import { LayoutGrid, Check } from "lucide-react";
import { hubLink } from "@/lib/hub";

const UHN_ADMIN_URL = `${(process.env.NEXT_PUBLIC_UHN_URL ?? "https://uhn.nerusalem.com").replace(/\/+$/, "")}/admin/cns`;

/**
 * Moves between the portals a person actually has.
 *
 * Deliberately only renders what you are entitled to: a nurse sees Hub and CNS,
 * a recruiter additionally sees their employer portal, staff additionally see
 * admin. Nobody is shown a door they cannot open — that is the whole point of
 * splitting the spaces rather than hiding buttons inside one.
 */

export type Portal = { key: string; label: string; desc: string; href: string; external?: boolean };

export function PortalSwitcher({
  current,
  employers,
  isStaff,
  isInstructor,
}: {
  current: "member" | "employer" | "admin" | "instructor";
  employers?: { id: string; name: string }[];
  isStaff?: boolean;
  isInstructor?: boolean;
}) {
  const portals: Portal[] = [
    { key: "hub", label: "Nerusalem", desc: "Network, units, marketplace", href: hubLink("/home"), external: true },
    { key: "member", label: "Central Nerusalem Space", desc: "Learning, jobs, resume", href: "/" },
    ...(employers ?? []).map((e) => ({
      key: `employer:${e.id}`,
      label: e.name,
      desc: "Employer portal",
      href: `/employer/${e.id}`,
    })),
    ...(isInstructor
      ? [{ key: "instructor", label: "Teaching", desc: "Author your courses", href: "/instructor" }]
      : []),
    // Admin lives in the UHN console since 2026-10-09 (one place for all of it).
    ...(isStaff
      ? [{ key: "admin", label: "Admin", desc: "Platform administration", href: UHN_ADMIN_URL, external: true }]
      : []),
  ];

  return (
    <div className="group relative">
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Switch portal"
      >
        <LayoutGrid className="h-5 w-5" />
      </button>

      <div className="invisible absolute right-0 top-full z-50 w-72 pt-2 opacity-0 transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-popover">
          {portals.map((p) => {
            const active =
              (current === "member" && p.key === "member") ||
              (current === "admin" && p.key === "admin") ||
              (current === "instructor" && p.key === "instructor") ||
              (current === "employer" && p.key.startsWith("employer:"));
            const Cmp = p.external ? "a" : Link;
            return (
              <Cmp
                key={p.key}
                href={p.href}
                aria-current={active ? "page" : undefined}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted"
              >
                <span className="mt-0.5 w-4 shrink-0">
                  {active && <Check className="h-4 w-4 text-primary" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.label}</span>
                  <span className="block text-xs text-muted-foreground">{p.desc}</span>
                </span>
              </Cmp>
            );
          })}
        </div>
      </div>
    </div>
  );
}

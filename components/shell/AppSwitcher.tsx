import { LayoutGrid } from "lucide-react";
import { hubLink } from "@/lib/hub";

/**
 * Moves between the two apps. Plain <a> on purpose — these are separate
 * origins, so a full navigation is required and next/link's prefetch would be
 * wasted. Mount the mirrored version in HUB's header so the pairing is
 * discoverable from both sides.
 */
export function AppSwitcher({ current }: { current: "hub" | "cns" }) {
  const apps = [
    { key: "hub", label: "UNN Hub", desc: "Network, units, marketplace", href: hubLink("/home") },
    { key: "cns", label: "UNN CNS", desc: "Learning, question banks, jobs", href: "/" },
  ] as const;

  return (
    <div className="group relative">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border transition-colors hover:bg-muted"
        aria-label="Switch app"
      >
        <LayoutGrid className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className="invisible absolute right-0 top-full z-50 w-64 pt-2 opacity-0 transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {apps.map((app) => {
            const isCurrent = app.key === current;
            return (
              <a
                key={app.key}
                href={app.href}
                aria-current={isCurrent ? "page" : undefined}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted"
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    isCurrent ? "bg-primary" : "bg-border"
                  }`}
                />
                <span>
                  <span className="block text-sm font-medium">{app.label}</span>
                  <span className="block text-xs text-muted-foreground">{app.desc}</span>
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

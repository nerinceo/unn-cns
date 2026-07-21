"use client";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

interface Tab {
  label: string;
  value: string;
}

interface TabsProps {
  tabs: Tab[];
  defaultValue?: string;
  /**
   * Panel content keyed by tab value. Pass plain React elements (NOT a render
   * function) so this works when rendered from a Server Component — a function
   * child can't cross the server→client boundary and throws "Functions are not
   * valid as a child of Client Components". Elements serialize fine.
   */
  panels: Record<string, React.ReactNode>;
  className?: string;
}

export function Tabs({ tabs, defaultValue, panels, className }: TabsProps) {
  const [active, setActive] = useState(defaultValue || tabs[0]?.value);
  return (
    <div className={className}>
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActive(tab.value)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              active === tab.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-4">{panels[active]}</div>
    </div>
  );
}

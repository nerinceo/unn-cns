"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/cns/library";

/**
 * Contents rail for a library article.
 *
 * The only client-side code on the page, and it exists for one reason: to show
 * where you are in a 13-section article. Without that the rail is a list of
 * links that never acknowledges the scroll, which reads as broken rather than
 * as minimal.
 *
 * The links themselves are plain anchors and work with JavaScript disabled —
 * this component adds the highlight, not the navigation.
 */
export function ArticleToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const targets = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!targets.length) return;

    /**
     * rootMargin pins the trigger line near the top of the viewport: -45% at
     * the bottom means a heading only counts as current once it has scrolled
     * into the upper part of the screen. Watching the whole viewport instead
     * would keep the LAST visible heading active, so the rail would run ahead
     * of what is actually being read.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        const onscreen = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (onscreen[0]) setActive(onscreen[0].target.id);
      },
      { rootMargin: "-88px 0px -45% 0px", threshold: 0 }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-3 text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
        On this page
      </p>
      <ul className="space-y-0.5 border-l border-border">
        {items.map((item) => {
          const current = item.id === active;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={current ? "true" : undefined}
                className={`-ml-px block border-l-2 py-1.5 pl-4 leading-snug transition-colors ${
                  current
                    ? "border-primary font-semibold text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import { useEffect, useRef } from "react";

/**
 * Question Bank Pro inside the CNS shell (Naveen, 2026-10-15: "keep the
 * header and footer"; the bank keeps its own structure, restyled to CNS).
 *
 * The bank's pages are the copied nerusalem.in pages — their own scripts,
 * overlays and links — served same-origin from `src`. They live in a frame so
 * the CNS header and bottom bar stay around them without either side's styles
 * or scripts touching the other. The frame fills the space between the header
 * and the bottom bar and scrolls on its own, which keeps the exam paper and
 * other fixed overlays inside the bank's visible area.
 *
 * The address bar follows the frame: every page the member opens inside it is
 * mirrored onto this page's URL (and title), so a reload, a shared link or the
 * back button lands on the same bank page.
 */
export function ProBankFrame({ src, frameBase, homeBase }: { src: string; frameBase: string; homeBase: string }) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const sync = () => {
      try {
        const loc = el.contentWindow?.location;
        if (!loc || !loc.pathname.startsWith(`${frameBase}/`)) return;
        const url = `${homeBase}/${loc.pathname.slice(frameBase.length + 1)}${loc.search}${loc.hash}`;
        if (url !== window.location.pathname + window.location.search + window.location.hash) {
          window.history.replaceState(window.history.state, "", url);
        }
        const title = el.contentDocument?.title;
        if (title) document.title = `${title} — Central Nerusalem Space`;
      } catch {
        // Cross-origin (an external link opened in the frame): leave the URL as it is.
      }
    };
    el.addEventListener("load", sync);
    return () => el.removeEventListener("load", sync);
  }, [frameBase, homeBase]);

  return (
    <iframe
      ref={frame}
      src={src}
      title="RGUHS B.Sc Nursing Question Bank Pro"
      // Header h-16 + the shell's top padding, and the bottom bar below lg.
      className="block h-[calc(100dvh-4rem-1.25rem-6rem)] w-full rounded-xl border border-border bg-white sm:h-[calc(100dvh-4rem-1.5rem-6rem)] lg:h-[calc(100dvh-4rem-2rem-2rem)]"
    />
  );
}

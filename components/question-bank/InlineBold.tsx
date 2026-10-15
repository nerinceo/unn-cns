import { Fragment } from "react";

/**
 * Plain-text answers with markdown bold ("**Goal:** …") — the RGUHS bank's
 * imported answers carry it (go-live check, 2026-10-15: up to 78 literal
 * "**" per sample page). Only the bold markers change: the text stays plain
 * React text (no HTML is parsed, so nothing can be injected) and the caller's
 * whitespace-pre-wrap keeps every line break and list exactly as before.
 */
export function InlineBold({ text }: { text: string }) {
  const parts = text.split(/\*\*([^*\n](?:[^*]*?[^*\n])?)\*\*/g);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-bold text-foreground">
            {p}
          </strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

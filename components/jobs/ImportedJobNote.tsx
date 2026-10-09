import { Info } from "lucide-react";

/**
 * Why an imported role applies off-site, and the credit its source requires.
 *
 * Adzuna's API terms require a visible "Jobs by Adzuna" credit linking back on
 * every page that shows its listings; Jooble's link-through is the Apply
 * button itself.
 */
export function ImportedJobNote({ source, sourceName }: { source: string; sourceName: string | null }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        This role is listed on {sourceName ?? "another site"}. The employer is not on Nerusalem yet, so you
        apply on the original posting. Save it here to keep track of it.
        {source === "adzuna" && (
          <>
            {" "}
            <a
              href="https://www.adzuna.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline"
            >
              Jobs by Adzuna
            </a>
          </>
        )}
      </p>
    </div>
  );
}

"use client";

/**
 * Last-resort error page, for a failure in the root layout itself — the one
 * place app/error.tsx cannot catch, because it renders inside that layout.
 * Replaces the whole document, so it carries its own <html>/<body> and inline
 * styles (globals.css is not guaranteed to have loaded). Mirrors HUB's
 * global-error, minus the raw error message.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#ffffff" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ maxWidth: "400px", textAlign: "center" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", marginBottom: "0.5rem" }}>Something went wrong</h2>
            <p style={{ fontSize: "0.875rem", color: "#666", marginBottom: "1.5rem" }}>
              We hit an unexpected error. Please try again.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "0.5rem 1rem",
                background: "#0a2463",
                color: "white",
                border: "none",
                borderRadius: "0.5rem",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

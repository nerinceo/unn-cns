import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#0a2463",
        "primary-foreground": "#ffffff",
        secondary: "#8b0000",
        "secondary-foreground": "#ffffff",
        // White ground, structure carried by the line. See the "flat surfaces"
        // note in app/globals.css: nothing is separated by elevation any more,
        // so the border token has to be strong enough to define a panel edge
        // against a white canvas on its own. #e0e0e0 was tuned for cards that
        // ALSO had a shadow and disappears without one.
        background: "#ffffff",
        foreground: "#14161a",
        border: "#d9dee6",
        muted: "#f3f5f8",
        // #6b7280 (grey-500) is 5.3:1 on white — it passes AA and still reads
        // washed out, and it is the colour of almost every secondary string in
        // the app: timestamps, bylines, field labels, counts, empty states.
        // #475467 is 8.1:1. Nothing about the hierarchy changes — it is still
        // clearly quieter than the foreground — it is just legible now.
        "muted-foreground": "#475467",
        card: "#ffffff",
        "card-foreground": "#14161a",

        // The brand ramp, derived from primary #0a2463 (which stays the 800
        // stop). Additive — nothing above is re-pointed. Lets a tint be
        // written as `bg-brand-50`, an opaque colour, rather than
        // `bg-primary/5`, which composites differently depending on what is
        // behind it and so drifts between a card and the canvas.
        brand: {
          50: "#f2f5fc",
          100: "#e3eaf8",
          200: "#c7d5f0",
          300: "#9db4e3",
          400: "#6b8bd1",
          500: "#4667bb",
          600: "#2f4b9c",
          700: "#1d3578",
          800: "#0a2463",
          900: "#081b4b",
          950: "#050f2c",
        },

        // Semantic tones, so pages stop hand-picking palette values for the
        // same three meanings. Additive: HUB has no `*-success` / `*-warning` /
        // `*-danger` utilities today, so these emit nothing here — they exist
        // because this file is mirrored EXACTLY into CNS (check:drift), whose
        // status badges are written with them.
        success: "#047857",
        "success-soft": "#ecfdf5",
        warning: "#b45309",
        "warning-soft": "#fffbeb",
        danger: "#b91c1c",
        "danger-soft": "#fef2f2",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
      },
      // Only the two small steps move, and they are the two that carry the
      // app: `text-sm` is the body size for virtually every row, label and
      // paragraph here, and `text-xs` every caption under one. 14/12 is a
      // dense-tool default that assumes a young developer on a 14" laptop;
      // this is a clinical product read all day, often on a ward machine.
      //
      // Deliberately NOT done by raising the root font-size: Tailwind's
      // spacing scale is rem too, so that would inflate every padding, gap and
      // width on the page by the same 7% and reflow the entire app. Overriding
      // the fontSize scale moves type and nothing else.
      //
      // `base` and up are untouched, so headings keep their current sizes and
      // the gap between body and heading simply narrows a little.
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.125rem" }], // 13/18 (was 12/16)
        sm: ["0.9375rem", { lineHeight: "1.375rem" }], // 15/22 (was 14/20)
      },
      // Tightened for the flat theme. A 12–16px corner belongs on a card that
      // floats; on a flat outlined panel it reads soft and consumer-ish, and
      // it was the last thing making this look like a social app rather than
      // a tool. `xl` deliberately lands on the same 8px as `lg` — in this
      // language there is one panel radius, not two — and the scale stays
      // monotonic (4 / 6 / 8 / 8 / 12) so nothing inverts.
      //
      // Radius affects no layout, so this is broad but not risky: 494
      // `rounded-xl`, 438 `rounded-lg` and 48 `rounded-2xl` all tighten
      // together and stay in proportion.
      borderRadius: {
        sm: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.5rem",
        "2xl": "0.75rem",
      },
      // ── Additive ─────────────────────────────────────────────────────────
      // Everything below introduces NEW utility names; no existing token is
      // re-pointed.
      boxShadow: {
        // Mirrors the --shadow-* scale in app/globals.css.
        //
        // These are for OVERLAYS ONLY — dropdowns, popovers, dialogs, toasts.
        // Surfaces in this theme are flat and separated by their border; see
        // the "flat surfaces" note in app/globals.css for why. Reaching for
        // one of these on a card undoes that decision locally and makes the
        // card look like it is peeling off the page next to its neighbours.
        xs: "0 1px 2px rgba(16, 24, 40, 0.04)",
        card: "0 1px 2px rgba(16, 24, 40, 0.05), 0 1px 3px rgba(16, 24, 40, 0.04)",
        elevated:
          "0 2px 4px rgba(16, 24, 40, 0.04), 0 6px 16px -4px rgba(16, 24, 40, 0.08)",
        float:
          "0 4px 8px rgba(16, 24, 40, 0.04), 0 14px 32px -8px rgba(16, 24, 40, 0.12)",
        popover:
          "0 8px 16px -4px rgba(16, 24, 40, 0.08), 0 24px 48px -12px rgba(16, 24, 40, 0.18)",
        // CNS names, kept so its markup compiles against this mirrored file.
        // Unused in HUB. Inside the shell a card's shadow is cancelled anyway
        // (flat surfaces); `pop` is an overlay and keeps its elevation.
        "card-hover":
          "0 2px 4px rgba(16, 24, 40, 0.04), 0 6px 16px -4px rgba(16, 24, 40, 0.08)",
        pop: "0 8px 16px -4px rgba(16, 24, 40, 0.08), 0 24px 48px -12px rgba(16, 24, 40, 0.18)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out both",
        "fade-up": "fade-up 220ms cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;

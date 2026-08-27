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
        // Deeper than the old #f5f7fa. White cards on near-white ground had
        // almost no separation, which is what made every page read flat —
        // dropping the ground gives the cards contrast without touching them.
        background: "#e9eef5",
        foreground: "#111827",
        // Cooler than the old flat #e0e0e0, so borders sit with the slate
        // greys the rest of the palette uses instead of reading warm.
        border: "#e2e8f0",
        muted: "#f1f5f9",
        // Was #6b7280 — about 4.8:1 on a white card. That is the floor for
        // body copy and below it for the 12-13px metadata this token is
        // mostly used on, which is why secondary text read as unreadable grey
        // across the app. #475569 (slate-600) measures 7.58:1.
        "muted-foreground": "#475569",
        card: "#ffffff",
        "card-foreground": "#1a1a1a",
        // Semantic tones, so pages stop hand-picking palette values for the
        // same three meanings.
        success: "#047857",
        "success-soft": "#ecfdf5",
        warning: "#b45309",
        "warning-soft": "#fffbeb",
        danger: "#b91c1c",
        "danger-soft": "#fef2f2",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04)",
        "card-hover": "0 6px 20px rgba(16,24,40,0.09)",
        pop: "0 12px 32px rgba(16,24,40,0.14)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
    },
  },
  plugins: [],
};
export default config;

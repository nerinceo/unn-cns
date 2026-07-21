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
        background: "#f5f7fa",
        foreground: "#1a1a1a",
        border: "#e0e0e0",
        muted: "#f0f2f5",
        "muted-foreground": "#6b7280",
        card: "#ffffff",
        "card-foreground": "#1a1a1a",
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

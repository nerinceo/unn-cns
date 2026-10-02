import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Same font, same variable name, same Tailwind wiring as HUB. Visual identity
// is a product requirement here: crossing between unn.nerusalem.com and
// cns.nerusalem.com must not feel like leaving the product.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Central Nerusalem Space — Learning, Question Banks & Careers",
  description:
    "Clinical Nursing Suite — courses, question banks, exams and nursing jobs for Nerusalem members.",
  // Installed-app name ("Add to Home screen") — same brand as HUB and UHN.
  // public/manifest.json name/short_name must match. Icons are file-based:
  // app/icon.png + app/apple-icon.png (the crest on white, maskable-safe).
  applicationName: "Nerusalem",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: false,
    statusBarStyle: "default",
    title: "Nerusalem",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a2463",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-background text-foreground font-sans antialiased">
        {children}
      </body>
    </html>
  );
}

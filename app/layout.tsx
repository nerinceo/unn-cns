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
  title: "Central Nursing Systems — Learning, Question Banks & Careers",
  description:
    "Clinical Nursing Suite — courses, question banks, exams and nursing jobs for Nerusalem members.",
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

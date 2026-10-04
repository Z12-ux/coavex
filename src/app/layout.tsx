import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { getCurrentUser } from "@/server/auth/session";
import { dirFor } from "@/lib/i18n/dictionary";

// Barlow for reading, Barlow Condensed for uppercase display and numbers ("Forge" look).
const body = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-barlow", display: "swap" });
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-barlow-condensed", display: "swap" });

export const metadata: Metadata = {
  title: { default: "COAVEX", template: "%s · COAVEX" },
  description: "Fitness Coaching Operating System — command center, client signals, next best action, adaptive programs, check-ins and weekly review.",
  applicationName: "COAVEX",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070907",
};

// Applied before paint so the chosen theme never flashes (dark "Forge" is the default).
const THEME_SCRIPT = `try{if(localStorage.getItem("coachos:theme")==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const locale = user?.locale ?? "fr";
  return (
    <html lang={locale} dir={dirFor(locale)} className={`${body.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}

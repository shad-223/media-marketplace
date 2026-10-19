import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Fraunces, Hanken_Grotesk, Noto_Sans_Bengali } from "next/font/google";

import { Footer, Header, NoticeBar } from "@/components/Header";

import { Providers } from "./providers";

const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["500", "700"] });
const bangla = Noto_Sans_Bengali({ subsets: ["bengali"], variable: "--font-bangla", display: "swap", weight: ["500", "600"] });

export const metadata: Metadata = {
  title: { default: "Media — Buy & sell digital assets with escrow", template: "%s · Media" },
  description:
    "Buy and sell YouTube channels, Facebook pages, Instagram & TikTok accounts, websites, apps and domains — every trade protected by escrow. Pay with bKash, Nagad, Rocket or bank.",
};

export const viewport: Viewport = { themeColor: "#0b1f1e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${bangla.variable}`}>
      <body className="min-h-screen bg-cream font-sans text-ink antialiased">
        <Providers>
          <NoticeBar />
          <Header />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

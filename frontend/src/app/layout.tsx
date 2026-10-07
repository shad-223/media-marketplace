import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { Footer, Header, NoticeBar } from "@/components/Header";

import { Providers } from "./providers";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Media — Buy & sell digital assets with escrow", template: "%s · Media" },
  description:
    "Buy and sell YouTube channels, Facebook pages, Instagram & TikTok accounts, websites, apps and domains — every trade protected by escrow. Pay with bKash, Nagad, Rocket or bank.",
};

export const viewport: Viewport = { themeColor: "#5b21e6", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.variable}>
      <body className="min-h-screen bg-slate-50 font-sans text-ink antialiased">
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

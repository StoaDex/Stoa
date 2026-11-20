import type { Metadata, Viewport } from "next";
import Providers from "@/components/Providers";
import SiteAnalytics from "@/components/SiteAnalytics";
import { SITE } from "@/lib/chain";
import { Inter, JetBrains_Mono, Marcellus } from "next/font/google";
import "./globals.css";

// self-hosted at build time (no request to Google, nothing render-blocking); globals.css reads the variables
const serif = Marcellus({ subsets: ["latin"], weight: "400", display: "swap", variable: "--font-serif" });
const sans = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Stoa — Every route, compared. Swaps on Robinhood Chain and Elysium", template: "%s · Stoa" },
  description: "A swap router on Robinhood Chain and Elysium. Every swap is compared across every venue the router uses, for your exact amount, and filled on the one that pays the most.",
  // no fixed title or url here, so each page's own title is used when a link is shared
  openGraph: { description: "Swap on Robinhood Chain and Elysium. Every venue the router uses, compared on every swap.", siteName: "Stoa", type: "website", images: [{ url: "/og-v5.png", width: 1200, height: 630, alt: "Stoa: every route, compared. Swaps on Robinhood Chain and Elysium" }] },
  twitter: { card: "summary_large_image", site: "@StoaDex", description: "Swap on Robinhood Chain and Elysium. Every venue the router uses, compared on every swap.", images: ["/og-v5.png"] },
  // installed as an app (manifest.ts): name and status bar on iPhone home screens
  appleWebApp: { capable: true, title: "Stoa", statusBarStyle: "default" },
  // Google Search Console ownership (URL-prefix property https://stoadex.com)
  verification: { google: "AP_Tt9q0yq2k5u87TR5_9tr2uUQclr70RT9jfRFjVLA" },
};
// structured data for search engines: who Stoa is and what the site does
const LD = [
  { "@context": "https://schema.org", "@type": "Organization", name: "Stoa", url: SITE, logo: `${SITE}/logo.png`, sameAs: ["https://x.com/StoaDEX", "https://t.me/StoaDex", "https://t.me/StoaDexChat", "https://github.com/StoaDex/Stoa"] },
  { "@context": "https://schema.org", "@type": "WebSite", name: "Stoa", url: SITE },
  {
    "@context": "https://schema.org", "@type": "WebApplication", name: "Stoa", url: `${SITE}/trade`, applicationCategory: "FinanceApplication", operatingSystem: "Web",
    description: "Swap router on Robinhood Chain and Elysium: every swap is compared across every venue the router uses and filled on the one that pays the most.",
  },
];
export const viewport: Viewport = { themeColor: "#EEF2F6", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      {/* the footer's HEY Research Lab badge is the largest picture on short pages: open its connection early */}
      <head><link rel="preconnect" href="https://heyresearch.xyz" /></head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LD) }} />
        <Providers>{children}</Providers>
        <SiteAnalytics />
      </body>
    </html>
  );
}

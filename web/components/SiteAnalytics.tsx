"use client";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { analyticsUrl } from "@/lib/analyticsUrl";

/** Visit counts with Vercel Web Analytics: no cookies, and a visitor is a hash of the request that is discarded after
 *  24 hours. Every page address is cleaned first (lib/analyticsUrl.ts), so no wallet address is ever sent. */
export default function SiteAnalytics() {
  // Speed Insights: how fast pages load on real visitors' phones and computers (Core Web Vitals), same address cleaning
  return (
    <>
      <Analytics beforeSend={(e) => ({ ...e, url: analyticsUrl(e.url) })} />
      <SpeedInsights beforeSend={(e) => ({ ...e, url: analyticsUrl(e.url) })} />
    </>
  );
}

import { ImageResponse } from "next/og";
import { BLUE, MUTED, OG_SIZE, OgFrame, ogFonts } from "@/lib/og";
import { readRouterStats, type RouterStats } from "@/lib/routerStats";

// Live card for links to /stats: volume and swaps through the Stoa router, re-read every 5 minutes.
export const revalidate = 300;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Volume through Stoa on Robinhood Chain and Elysium, read from the routers' on-chain events.";

const usd = (v: number) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function Image() {
  let s: RouterStats | null = null;
  try { s = await readRouterStats(); } catch { /* card still renders without numbers */ }
  const per = (k: "usd7d" | "usd24h") => s?.chains.map((c) => `${c.name.replace(" Chain", "")} ${usd(c[k])}`).join(" · ") ?? "live on stoadex.com";
  const stats: [string, string, string][] = [
    ["VOLUME · ALL TIME", s ? usd(s.total.usdAll) : "—", s ? `${s.total.swaps.toLocaleString("en-US")} swap${s.total.swaps === 1 ? "" : "s"}` : "live on stoadex.com"],
    ["LAST 7 DAYS", s ? usd(s.total.usd7d) : "—", per("usd7d")],
    ["LAST 24 HOURS", s ? usd(s.total.usd24h) : "—", per("usd24h")],
  ];
  return new ImageResponse(
    (
      <OgFrame url="stoadex.com/stats" foot="LIVE ON-CHAIN DATA · ROUTER EVENTS">
        <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
          <span style={{ fontFamily: "Marcellus", fontSize: 74, lineHeight: 1 }}>Volume through Stoa</span>
          <span style={{ fontFamily: "Marcellus", fontSize: 38, color: BLUE, marginTop: 14 }}>Every swap, counted from the chain.</span>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 38 }}>
          {stats.map(([k, v, sub]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", flex: 1, background: "rgba(255,255,255,.95)", borderRadius: 22, padding: "20px 24px", boxShadow: "0 16px 36px rgba(24,32,44,.10)" }}>
              <span style={{ fontFamily: "Mono", fontSize: 14, letterSpacing: 3, color: MUTED }}>{k}</span>
              <span style={{ fontSize: 46, fontWeight: 700, marginTop: 8, color: k === "VOLUME · ALL TIME" ? BLUE : undefined }}>{v}</span>
              <span style={{ fontSize: 17, color: MUTED, marginTop: 4 }}>{sub}</span>
            </div>
          ))}
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}

import { ImageResponse } from "next/og";
import { BLUE, MUTED, OG_SIZE, OgFrame, ogFonts } from "@/lib/og";
import { readRouterStats } from "@/lib/routerStats";
import { CHANGES } from "@/lib/changelog";

// Link card for /weekly: this week so far (Monday 00:00 UTC on), re-read every 10 minutes. A slow RPC only drops the
// volume numbers, never the card.
export const revalidate = 600;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "This week on Stoa: volume routed, swaps and what shipped, Monday to Sunday UTC.";

const DAY = 86400;
const dayTxt = (t: number) => new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);

export default async function Image() {
  const now = Math.floor(Date.now() / 1000);
  const day = Math.floor(now / DAY);
  const start = (day - ((new Date(day * DAY * 1000).getUTCDay() + 6) % 7)) * DAY;
  const end = start + 7 * DAY;
  let vol: number | null = null, swaps: number | null = null;
  try {
    const s = await Promise.race([readRouterStats(), new Promise<never>((_, r) => setTimeout(() => r(new Error("slow")), 9_000))]);
    const days = s.days.filter((d) => { const t = Date.parse(`${d.date}T00:00:00Z`) / 1000; return t >= start && t < end; });
    vol = days.reduce((a, d) => a + Object.values(d.chains).reduce((x, c) => x + c.usd, 0), 0);
    swaps = days.reduce((a, d) => a + Object.values(d.chains).reduce((x, c) => x + c.swaps, 0), 0);
  } catch { /* card renders without volume */ }
  const shipped = CHANGES.filter((c) => { const t = Date.parse(`${c.date}T00:00:00Z`) / 1000; return t >= start && t < end; }).length;
  const stats: [string, string, string][] = [
    ["VOLUME", vol === null ? "—" : usd(vol), "routed through Stoa"],
    ["SWAPS", swaps === null ? "—" : swaps.toLocaleString("en-US"), "on Robinhood Chain and Elysium"],
    ["SHIPPED", String(shipped), shipped === 1 ? "update this week" : "updates this week"],
  ];
  return new ImageResponse(
    (
      <OgFrame url="stoadex.com/weekly" foot={`${dayTxt(start).toUpperCase()} – ${dayTxt(end - DAY).toUpperCase()} (UTC) · SO FAR · READ FROM THE CHAIN`}>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
          <span style={{ fontFamily: "Mono", fontSize: 18, letterSpacing: 6, color: BLUE }}>WEEKLY</span>
          <span style={{ fontFamily: "Marcellus", fontSize: 70, lineHeight: 1.05, marginTop: 10 }}>This week on <span style={{ color: BLUE, marginLeft: 18 }}>Stoa.</span></span>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 38 }}>
          {stats.map(([k, v, sub]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", flex: 1, background: "rgba(255,255,255,.95)", borderRadius: 22, padding: "20px 24px", boxShadow: "0 16px 36px rgba(24,32,44,.10)" }}>
              <span style={{ fontFamily: "Mono", fontSize: 14, letterSpacing: 3, color: MUTED }}>{k}</span>
              <span style={{ fontSize: 46, fontWeight: 700, marginTop: 8, color: k === "VOLUME" ? BLUE : undefined }}>{v}</span>
              <span style={{ fontSize: 17, color: MUTED, marginTop: 4 }}>{sub}</span>
            </div>
          ))}
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}

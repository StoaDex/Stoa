import { ImageResponse } from "next/og";
import { BLUE, MUTED, OG_SIZE, OgFrame, ogFonts } from "@/lib/og";
import { CA } from "@/lib/stoaAddress";
import { nextBuybackAt, readLocked, readSupply, type Supply } from "@/lib/stoaSupply";

// Live card for links to /token: burned, circulating and locked $STOA (curve progress before graduation) and the next
// buyback, re-read every 5 minutes.
export const revalidate = 300;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "$STOA: Stoa's protocol fees buy and burn it, holders lock it. Live burns, supply and $STOA locked.";

const short = (v: bigint) => {
  const n = Number(v) / 1e18;
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}B`;
  return n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(0);
};

export default async function Image() {
  let s: Supply | null = null;
  let locked: bigint | null = null;
  try { s = await readSupply(); } catch { /* card still renders without numbers */ }
  try { locked = (await readLocked()).total; } catch { /* idem */ }
  const pct = s ? (s.graduated ? 100 : Math.min(99.9, (Number(s.curveEth) / Number(s.threshold)) * 100)) : null;
  const eth = (v: bigint) => (Number(v) / 1e18).toFixed(2);
  const share = (a: bigint, b: bigint) => (b > 0n ? `${((Number(a) / Number(b)) * 100).toFixed(2)}%` : "—");
  const stats: [string, string, string][] = [
    s && !s.graduated
      ? ["PONS CURVE", pct === null ? "—" : `${pct.toFixed(1)}%`, `${eth(s.curveEth)} / ${eth(s.threshold)} ETH`]
      : ["BURNED", s ? short(s.burned) : "—", s ? `${share(s.burned, s.max)} of supply, at 0x…dEaD` : "sent to 0x…dEaD"],
    ["CIRCULATING", s ? short(s.circulating) : "—", s ? `of ${short(s.max)} supply` : "1B supply"],
    ["LOCKED BY HOLDERS", locked === null ? "—" : short(locked), "Spotlight, Rug Cover, maker bonds"],
  ];
  const nb = new Date(nextBuybackAt(Math.floor(Date.now() / 1000)) * 1000);
  const nbTxt = `${nb.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).toUpperCase()}, 13:41 UTC`;
  return new ImageResponse(
    (
      <OgFrame url="stoadex.com/token" foot={`NEXT BUYBACK ${nbTxt} · CA ${CA.slice(0, 6)}…${CA.slice(-4)} · LIVE`}>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
          <span style={{ fontFamily: "Marcellus", fontSize: 74, lineHeight: 1 }}>$STOA</span>
          <span style={{ fontFamily: "Marcellus", fontSize: 40, color: BLUE, marginTop: 14 }}>Fees buy it and burn it. Holders lock it.</span>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 38 }}>
          {stats.map(([k, v, sub]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", flex: 1, background: "rgba(255,255,255,.95)", borderRadius: 22, padding: "20px 24px", boxShadow: "0 16px 36px rgba(24,32,44,.10)" }}>
              <span style={{ fontFamily: "Mono", fontSize: 14, letterSpacing: 3, color: MUTED }}>{k}</span>
              <span style={{ fontSize: 46, fontWeight: 700, marginTop: 8, color: k === "PONS CURVE" || k === "BURNED" ? BLUE : undefined }}>{v}</span>
              <span style={{ fontSize: 17, color: MUTED, marginTop: 4 }}>{sub}</span>
            </div>
          ))}
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}

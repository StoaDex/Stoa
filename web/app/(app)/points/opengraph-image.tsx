import { ImageResponse } from "next/og";
import { OG_SIZE, ogFonts } from "@/lib/og";
import { SEASON_START, readPoints, readPreview } from "@/lib/points";

// Card for /points: the season 1 top 10, live (before the season: a preview of the last 7 days, labelled as such).
// Also the image the Monday recap uses. Never fails: without data it shows the season card.
export const revalidate = 300;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Stoa Points season 1: the top 10 wallets, read from the chain.";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default async function Image() {
  const pre = Date.now() / 1000 < SEASON_START;
  const b = await (pre ? readPreview() : readPoints()).catch(() => null);
  const rows = (b?.rows ?? []).slice(0, 10);
  const left = rows.slice(0, 5), right = rows.slice(5, 10);
  const Row = ({ r, i }: { r: { address: string; points: number }; i: number }) => (
    <div style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: "2px solid rgba(22,32,46,.1)" }}>
      <span style={{ fontFamily: "Mono", fontSize: 24, width: 56, color: i < 3 ? "#C2410C" : "#3A4658", fontWeight: 700 }}>{`#${i + 1}`}</span>
      <span style={{ fontFamily: "Mono", fontSize: 24 }}>{short(r.address)}</span>
      <span style={{ marginLeft: "auto", fontSize: 26, fontWeight: 700 }}>{n(r.points)}</span>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", fontFamily: "Inter", background: "#FFF8EC", color: "#16202E", position: "relative" }}>
        <div style={{ position: "absolute", left: -160, bottom: -260, width: 620, height: 620, borderRadius: 999, background: "radial-gradient(circle,#FFD45A 0%,#FFB13D 60%,#FF8A3D 100%)", display: "flex" }} />
        <div style={{ display: "flex", flexDirection: "column", padding: "52px 64px", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ display: "flex", fontFamily: "Mono", fontSize: 20, letterSpacing: 4, padding: "8px 16px", border: "3px solid #16202E", borderRadius: 999, background: "#fff" }}>STOA POINTS · SEASON 1</span>
            <span style={{ marginLeft: "auto", fontFamily: "Mono", fontSize: 18, color: "#3A4658" }}>{pre ? "PREVIEW · LAST 7 DAYS · NOT COUNTED" : `${b?.wallets ?? 0} WALLETS`}</span>
          </div>
          <span style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2, marginTop: 26 }}>{pre ? "Who would lead right now" : "Top 10"}</span>
          {rows.length ? (
            <div style={{ display: "flex", gap: 48, marginTop: 18 }}>
              <div style={{ display: "flex", flexDirection: "column", width: 500 }}>{left.map((r, i) => <Row key={r.address} r={r} i={i} />)}</div>
              <div style={{ display: "flex", flexDirection: "column", width: 500 }}>{right.map((r, i) => <Row key={r.address} r={r} i={i + 5} />)}</div>
            </div>
          ) : (
            <span style={{ fontSize: 34, color: "#3A4658", marginTop: 30 }}>No points yet. Swap on Stoa or share your referral link.</span>
          )}
          <div style={{ display: "flex", alignItems: "center", marginTop: "auto" }}>
            <span style={{ fontSize: 20, color: "#3A4658" }}>$1 swapped = 1 point · stock tokens 2× · referrers 10% · no promised value</span>
            <span style={{ marginLeft: "auto", display: "flex", padding: "11px 20px", borderRadius: 999, background: "#16202E", color: "#FFF8EC", fontFamily: "Mono", fontSize: 17 }}>stoadex.com/points</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts(), headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } },
  );
}

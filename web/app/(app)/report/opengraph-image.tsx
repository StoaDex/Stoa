import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BLUE, INK, MUTED, OG_SIZE, ogFonts } from "@/lib/og";
import { readStateReport } from "@/lib/stateReport";

export const revalidate = 3600;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "State of Robinhood Chain this week, from Stoa's open data.";

const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);

export default async function Image() {
  const r = await readStateReport().catch(() => null);
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public", "logo.png"))).toString("base64")}`;
  const Stat = ({ k, v, s }: { k: string; v: string; s: string }) => (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "22px 24px", background: "#fff", borderRadius: 18, border: "2px solid #E3E8F0" }}>
      <span style={{ fontFamily: "Mono", fontSize: 15, letterSpacing: 3, color: MUTED }}>{k}</span>
      <span style={{ fontSize: 50, fontWeight: 700, marginTop: 6 }}>{v}</span>
      <span style={{ fontSize: 18, color: MUTED, marginTop: 4 }}>{s}</span>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "48px 60px", fontFamily: "Inter", color: INK, background: "linear-gradient(160deg,#EAF2FF 0%,#F7FAFF 55%,#FFF6E5 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={logo} width={40} height={40} style={{ objectFit: "contain" }} />
          <span style={{ fontFamily: "Marcellus", fontSize: 24, letterSpacing: 8 }}>STOA</span>
          <span style={{ marginLeft: "auto", fontFamily: "Mono", fontSize: 16, letterSpacing: 4, color: BLUE }}>WEEKLY REPORT</span>
        </div>
        <span style={{ fontFamily: "Marcellus", fontSize: 70, marginTop: 34, lineHeight: 1 }}>State of Robinhood Chain</span>
        {r ? (
          <div style={{ display: "flex", gap: 18, marginTop: 34 }}>
            <Stat k="SWAPS VIA STOA" v={r.stoa.swaps.toLocaleString("en-US")} s={`${usd(r.stoa.usd)} · 7 days`} />
            <Stat k="STOCK TOKENS" v={String(r.stocks.tracked)} s={`${r.stocks.liquid} with $50K+ liquidity`} />
            <Stat k="MEDIAN GAP" v={r.stocks.medianGapNow == null ? "—" : `${r.stocks.medianGapNow.toFixed(2)}%`} s="on-chain vs Robinhood" />
          </div>
        ) : <span style={{ fontSize: 30, color: MUTED, marginTop: 30 }}>Swaps, stock token prices and venue depth, from open data.</span>}
        <div style={{ display: "flex", alignItems: "center", marginTop: "auto" }}>
          <span style={{ fontSize: 20, color: MUTED }}>From Stoa&apos;s open data on Hugging Face</span>
          <span style={{ marginLeft: "auto", display: "flex", padding: "11px 20px", borderRadius: 999, background: "linear-gradient(135deg,#1F5FB0,#4C97F0)", color: "#fff", fontFamily: "Mono", fontSize: 17 }}>stoadex.com/report</span>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts(), headers: { "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=7200" } },
  );
}

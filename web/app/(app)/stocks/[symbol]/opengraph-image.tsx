import { ImageResponse } from "next/og";
import { BLUE, MUTED, OG_SIZE, OgFrame, ogFonts } from "@/lib/og";
import { mid, stockBySymbol } from "@/lib/stocks";

// Card for links to /stocks/<symbol>: ticker, company and the two prices (no company logo). Never fails: without data
// it renders the ticker alone.
export const revalidate = 300;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A Robinhood Stock Token on Robinhood Chain: Robinhood's price and the on-chain price.";

const money = (v: number | null) => (v == null ? "—" : `$${v >= 1 ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toPrecision(3)}`);

export default async function Image({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const hit = await stockBySymbol(symbol).catch(() => null);
  const s = hit?.stock;
  const sym = (s?.symbol ?? symbol).toUpperCase().slice(0, 8);
  const ref = s ? mid(s) : null;
  const onc = s?.dex?.priceUsd ?? null;
  const stat = (label: string, v: string) => (
    <div style={{ display: "flex", flexDirection: "column", background: "#fff", border: "1px solid rgba(30,38,51,.10)", borderRadius: 14, padding: "14px 24px", minWidth: 260 }}>
      <span style={{ fontFamily: "Mono", fontSize: 14, letterSpacing: 2, color: MUTED }}>{label}</span>
      <span style={{ fontFamily: "Mono", fontSize: 40, marginTop: 6 }}>{v}</span>
    </div>
  );
  return new ImageResponse(
    (
      <OgFrame url={`stoadex.com/stocks/${sym.toLowerCase()}`} network="robinhood" foot="STOCK TOKENS · ROBINHOOD CHAIN">
        <div style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
          <span style={{ fontFamily: "Mono", fontSize: 18, letterSpacing: 3, color: BLUE }}>ROBINHOOD STOCK TOKEN</span>
          <span style={{ fontFamily: "Marcellus", fontSize: 96, lineHeight: 1.05, marginTop: 8 }}>{sym}</span>
          <span style={{ fontFamily: "Marcellus", fontSize: 32, color: MUTED }}>{(s?.name ?? "").slice(0, 44)}</span>
          <div style={{ display: "flex", gap: 16, marginTop: 26 }}>
            {stat("ROBINHOOD", money(ref))}
            {stat("ON-CHAIN", money(onc))}
            {stat(s?.route ? "SWAP ON STOA" : "STOA ROUTE", s?.route ? "Live" : "Not yet")}
          </div>
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts(), headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } },
  );
}

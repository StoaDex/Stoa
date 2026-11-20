import { ImageResponse } from "next/og";
import { BLUE, MUTED, OG_SIZE, OgFrame, ogFonts } from "@/lib/og";
import { readSwap } from "@/lib/swapShare";

// Card for links to /swap/<chain>/<hash>: what the trader paid and got, read from the transaction.
// Never fails: without data it renders a plain Stoa swap card.
export const revalidate = 86400;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A swap on Stoa, read from the chain.";

export default async function Image({ params }: { params: Promise<{ chain: string; hash: string }> }) {
  const { chain, hash } = await params;
  const s = await readSwap(chain, hash).catch(() => null);
  const fit = (t: string) => (t.length > 22 ? 46 : t.length > 16 ? 56 : 66);
  const side = (label: string, amount: string, sym: string, color: string) => {
    const t = `${amount} ${sym}`;
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: "Mono", fontSize: 16, letterSpacing: 3, color: MUTED }}>{label}</span>
        <span style={{ fontSize: fit(t), fontWeight: 700, color, marginTop: 4, lineHeight: 1.05 }}>{t}</span>
      </div>
    );
  };
  return new ImageResponse(
    (
      <OgFrame url="stoadex.com/trade" network={s?.net === "elysium" ? "elysium" : "robinhood"}
        foot={s ? `SWAPPED ON STOA${s.venues.length ? ` · FILLED ON ${s.venues.join(" + ").toUpperCase()}` : ""}` : "SWAPPED ON STOA · READ FROM THE CHAIN"}>
        {s ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 34, gap: 18 }}>
            {side("PAID", s.amountIn, s.symIn, "#18202C")}
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ width: 54, height: 54, borderRadius: 999, background: "#fff", color: BLUE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, boxShadow: "0 8px 20px rgba(24,32,44,.10)" }}>↓</div>
              <span style={{ fontFamily: "Marcellus", fontSize: 30, color: MUTED }}>every venue Stoa routes, compared</span>
            </div>
            {side("GOT", s.amountOut, s.symOut, BLUE)}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 60 }}>
            <span style={{ fontFamily: "Marcellus", fontSize: 64 }}>Swapped on Stoa,</span>
            <span style={{ fontFamily: "Marcellus", fontSize: 64, color: BLUE }}>every route compared.</span>
          </div>
        )}
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts(), headers: { "cache-control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400" } },
  );
}

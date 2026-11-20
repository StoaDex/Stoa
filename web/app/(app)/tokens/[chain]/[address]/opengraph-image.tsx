import { ImageResponse } from "next/og";
import { BLUE, MUTED, OG_SIZE, OgFrame, ogFonts } from "@/lib/og";
import { SITE } from "@/lib/chain";
import { findListed, priceFmt, readToken, usdFmt } from "@/lib/tokenInfo";

// Card for links to /tokens/<chain>/<address>: logo, price and Stoa's live route. Never fails: without data it renders
// a plain card with the symbol.
export const revalidate = 300;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A token on Stoa, with its price and the route Stoa finds.";

async function logo(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const r = await fetch(`${SITE}${path}`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") ?? "";
    if (!/image\/(png|jpeg)/.test(type)) return null; // the card renderer reads PNG and JPEG
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch { return null; }
}

export default async function Image({ params }: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await params;
  const hit = findListed(chain, address);
  const t = hit ? await readToken(chain, address).catch(() => null) : null;
  const sym = hit?.token.symbol ?? "TOKEN";
  const img = await logo(hit?.token.logo ?? null);
  const stat = (label: string, v: string) => (
    <div style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,.92)", borderRadius: 18, padding: "12px 22px", minWidth: 200 }}>
      <span style={{ fontFamily: "Mono", fontSize: 14, letterSpacing: 2, color: MUTED }}>{label}</span>
      <span style={{ fontFamily: "Mono", fontSize: 28, marginTop: 4 }}>{v}</span>
    </div>
  );
  return new ImageResponse(
    (
      <OgFrame url={`stoadex.com/tokens`} network={hit?.net.key === "elysium" ? "elysium" : "robinhood"} foot="EVERY ROUTE COMPARED · LIVE">
        <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {img
              ? <img src={img} width={112} height={112} style={{ borderRadius: 999, objectFit: "cover", boxShadow: "0 14px 30px rgba(24,32,44,.14)" }} />
              : <div style={{ width: 112, height: 112, borderRadius: 999, background: "#EAF1FB", color: BLUE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52, fontWeight: 700 }}>{sym.slice(0, 1)}</div>}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: "Marcellus", fontSize: 30, color: MUTED }}>Every route, compared</span>
              <span style={{ fontFamily: "Marcellus", fontSize: 76, lineHeight: 1.05 }}>{sym.slice(0, 14)}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 28 }}>
            {stat("PRICE", priceFmt(t?.priceUsd ?? null))}
            {stat("LIQUIDITY", usdFmt(t?.liquidityUsd ?? null))}
            {t?.quote ? stat("ON STOA NOW", `${t.quote.amountIn} ${t.gas} → ${t.quote.amountOut.length > 12 ? t.quote.amountOut.slice(0, 12) + "…" : t.quote.amountOut}`) : stat("24H VOLUME", usdFmt(t?.volume24h ?? null))}
          </div>
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts(), headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } },
  );
}

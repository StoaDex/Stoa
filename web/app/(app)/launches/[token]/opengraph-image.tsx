import { ImageResponse } from "next/og";
import { getAddress, isAddress } from "viem";
import { BLUE, MUTED, OG_SIZE, OgFrame, ogFonts } from "@/lib/og";
import { SITE } from "@/lib/chain";
import { readLaunch, type LaunchInfo } from "@/lib/ponsLaunch";

// Card for links to /launches/<token>: the token's logo, curve progress and market cap, read from the chain.
// Never fails: without data it renders a plain Pons launch card.
export const revalidate = 300;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A Pons launch on Robinhood Chain, with curve progress. On Stoa.";

const usd = (v: number | null) => (v === null ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);

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

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let l: LaunchInfo | null = null, img: string | null = null;
  try {
    if (isAddress(token, { strict: false })) l = await readLaunch(getAddress(token));
    img = await logo(l?.logo ?? null);
  } catch { /* plain card */ }

  const stat = (label: string, v: string) => (
    <div style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,.92)", borderRadius: 18, padding: "14px 22px", minWidth: 220 }}>
      <span style={{ fontFamily: "Mono", fontSize: 14, letterSpacing: 2, color: MUTED }}>{label}</span>
      <span style={{ fontFamily: "Mono", fontSize: 32, marginTop: 4 }}>{v}</span>
    </div>
  );

  return new ImageResponse(
    (
      <OgFrame url="stoadex.com/launches" foot={l?.graduated ? "GRADUATED · UNISWAP V4 · READ FROM THE CHAIN" : "PONS LAUNCH · READ FROM THE CHAIN"}>
        {l ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 30 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
              {img
                ? <img src={img} width={124} height={124} style={{ borderRadius: 999, objectFit: "cover", boxShadow: "0 14px 30px rgba(24,32,44,.14)" }} />
                : <div style={{ width: 124, height: 124, borderRadius: 999, background: "#EAF1FB", color: BLUE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56, fontWeight: 700 }}>{l.symbol.slice(0, 1)}</div>}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontFamily: "Marcellus", fontSize: 72, lineHeight: 1 }}>{`$${l.symbol.slice(0, 12)}`}</span>
                <span style={{ fontSize: 26, color: MUTED, marginTop: 8 }}>{l.name.slice(0, 40)}</span>
              </div>
            </div>
            {l.graduated ? (
              <span style={{ fontFamily: "Marcellus", fontSize: 40, color: BLUE, marginTop: 30 }}>{l.routable ? "Graduated. Now routes on Stoa." : "Graduated to Uniswap V4."}</span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", marginTop: 30 }}>
                <div style={{ display: "flex", height: 20, borderRadius: 999, background: "rgba(255,255,255,.85)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(2, l.progress)}%`, height: 20, background: BLUE, borderRadius: 999 }} />
                </div>
                <span style={{ fontFamily: "Mono", fontSize: 20, color: MUTED, marginTop: 10 }}>{`${l.progress.toFixed(1)}% to graduation · ${(+l.raised).toFixed(2)} / ${(+l.threshold).toFixed(1)} ${l.pairSymbol}`}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
              {stat("MARKET CAP", usd(l.mcapUsd))}
              {!l.graduated && stat("CREATOR TAX", `${(l.creatorTaxBps / 100).toFixed(1)}%`)}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 60 }}>
            <span style={{ fontFamily: "Marcellus", fontSize: 64 }}>A Pons launch,</span>
            <span style={{ fontFamily: "Marcellus", fontSize: 64, color: BLUE }}>read from the chain.</span>
          </div>
        )}
      </OgFrame>
    ),
    // ImageResponse defaults to a year-long immutable cache; progress moves, so the CDN keeps a card 5 minutes
    { ...size, fonts: await ogFonts(), headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } },
  );
}

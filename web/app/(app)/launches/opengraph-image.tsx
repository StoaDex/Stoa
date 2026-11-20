import { ImageResponse } from "next/og";
import { BLUE, MUTED, OG_SIZE, OgFrame, ogFonts } from "@/lib/og";
import { SITE } from "@/lib/chain";
import type { Launch } from "@/app/api/pons/launches/route";

// Card for links to /launches: the three live Pons curves closest to graduation, from our own CDN-cached API.
// Never fails the build: without data it still renders the title.
export const revalidate = 300;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Every live Pons launch on Robinhood Chain, with curve progress. On Stoa.";

const usd = (v: number | null) => (v === null ? "" : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);

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

export default async function Image() {
  let top: (Launch & { img: string | null })[] = [];
  try {
    const d = (await (await fetch(`${SITE}/api/pons/launches`, { signal: AbortSignal.timeout(8_000) })).json()) as { launches?: Launch[] };
    const live = (d.launches ?? []).filter((l) => !l.graduated).sort((a, b) => b.progress - a.progress).slice(0, 3);
    top = await Promise.all(live.map(async (l) => ({ ...l, img: await logo(l.logo) })));
  } catch { /* title-only card */ }

  return new ImageResponse(
    (
      <OgFrame url="stoadex.com/launches" foot="LIVE PONS CURVES · READ FROM THE CHAIN">
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 26 }}>
          <span style={{ fontFamily: "Marcellus", fontSize: 54 }}>Every live Pons launch,</span>
          <span style={{ fontFamily: "Marcellus", fontSize: 54, color: BLUE }}>one list.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 22 }}>
          {top.map((l) => (
            <div key={l.token} style={{ display: "flex", alignItems: "center", gap: 18, background: "rgba(255,255,255,.95)", borderRadius: 18, padding: "12px 20px", boxShadow: "0 12px 28px rgba(24,32,44,.08)" }}>
              {l.img
                ? <img src={l.img} width={46} height={46} style={{ borderRadius: 999, objectFit: "cover" }} />
                : <div style={{ width: 46, height: 46, borderRadius: 999, background: "#EAF1FB", color: BLUE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700 }}>{l.symbol.slice(0, 1)}</div>}
              <div style={{ display: "flex", flexDirection: "column", width: 250 }}>
                <span style={{ fontSize: 24, fontWeight: 700 }}>{l.symbol.slice(0, 12)}</span>
                <span style={{ fontSize: 15, color: MUTED }}>{l.name.slice(0, 26)}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <div style={{ display: "flex", height: 12, borderRadius: 999, background: "#E6ECF5", overflow: "hidden" }}>
                  <div style={{ width: `${l.progress}%`, height: 12, background: BLUE, borderRadius: 999 }} />
                </div>
                <span style={{ fontFamily: "Mono", fontSize: 15, color: MUTED, marginTop: 6 }}>{`${l.progress.toFixed(1)}% to graduation`}</span>
              </div>
              <span style={{ fontFamily: "Mono", fontSize: 20, width: 110, textAlign: "right", display: "flex", justifyContent: "flex-end" }}>{usd(l.mcapUsd)}</span>
            </div>
          ))}
          {!top.length && <span style={{ fontSize: 24, color: MUTED }}>Curve progress, market cap and creator tax for every live launch on Robinhood Chain.</span>}
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}

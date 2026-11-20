import { ImageResponse } from "next/og";
import { isAddress, type Address } from "viem";
import { MUTED, OG_SIZE, OgFrame, ogFonts } from "@/lib/og";
import { netByKey } from "@/lib/networks";
import { readSafety, type Safety } from "@/lib/safety";

// Card for links to /check/<chain>/<token>: the token, the verdict and what the test found. Never fails: without a
// result it renders the plain "check any token" card.
export const revalidate = 300;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A token safety check on Stoa.";

const V: Record<Safety["verdict"], { label: string; bg: string; fg: string }> = {
  ok: { label: "PASSED", bg: "#E7F4EC", fg: "#1F7A4D" },
  caution: { label: "CAUTION", bg: "#FFF3DF", fg: "#9A5B0B" },
  danger: { label: "RISKY", bg: "#FDECEA", fg: "#B4442E" },
  unknown: { label: "NOT CHECKED", bg: "#EEF1F5", fg: "#5A6678" },
};
const pct = (v: number) => `${v.toFixed(1)}%`;

export default async function Image({ params }: { params: Promise<{ chain: string; token: string }> }) {
  const { chain, token } = await params;
  const net = netByKey(chain);
  let s: Safety | null = null;
  if (net && isAddress(token, { strict: false })) {
    s = await Promise.race([readSafety(net, token as Address), new Promise<null>((r) => setTimeout(() => r(null), 12_000))]).catch(() => null);
  }
  const v = V[s?.verdict ?? "unknown"];
  const t = s?.test;
  const rows: [string, string][] = [];
  if (t) rows.push(["SELL BACK", t.sellOk ? "works" : t.buyOk ? "failed" : "not run"]);
  if (t?.sellOk) rows.push(["HIDDEN TAX", `${(t.buyTaxPct ?? 0) >= 0.1 ? pct(t.buyTaxPct!) : "none"} · ${(t.sellTaxPct ?? 0) >= 0.1 ? pct(t.sellTaxPct!) : "none"}`]);
  if (s?.creatorPct !== null && s?.creatorPct !== undefined) rows.push(["CREATOR HOLDS", pct(s.creatorPct)]);
  if (s?.top10Pct !== null && s?.top10Pct !== undefined) rows.push(["TOP 10 HOLD", pct(s.top10Pct)]);
  const sym = s?.symbol ? `$${s.symbol}` : `${token.slice(0, 6)}…${token.slice(-4)}`;
  return new ImageResponse(
    (
      <OgFrame url="stoadex.com/check" network={net?.key === "elysium" ? "elysium" : "robinhood"} foot="FREE SAFETY CHECK · SIMULATED, NOTHING SENT">
        <div style={{ display: "flex", flexDirection: "column", marginTop: 30 }}>
          <span style={{ fontFamily: "Marcellus", fontSize: 30, color: MUTED }}>Stoa safety check</span>
          <div style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 4 }}>
            <span style={{ fontFamily: "Marcellus", fontSize: 84, lineHeight: 1.05 }}>{sym.slice(0, 14)}</span>
            <span style={{ display: "flex", padding: "10px 24px", borderRadius: 999, background: v.bg, color: v.fg, fontFamily: "Mono", fontSize: 30, letterSpacing: 3 }}>{v.label}</span>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 30 }}>
            {rows.slice(0, 4).map(([k, val]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,.92)", borderRadius: 18, padding: "12px 22px", minWidth: 200 }}>
                <span style={{ fontFamily: "Mono", fontSize: 14, letterSpacing: 2, color: MUTED }}>{k}</span>
                <span style={{ fontFamily: "Mono", fontSize: 28, marginTop: 4 }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts(), headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } },
  );
}

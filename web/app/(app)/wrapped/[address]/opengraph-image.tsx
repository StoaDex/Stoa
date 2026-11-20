import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { isAddress } from "viem";
import { BLUE, INK, MUTED, OG_SIZE, ogFonts } from "@/lib/og";
import { readWrapped } from "@/lib/wrapped";

// Card for links to /wrapped/<address>: the wallet's Stoa Wrapped numbers and edition. Never fails: without data it
// renders a plain Wrapped card. No third-party logos, only Stoa's own.
export const revalidate = 600;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A Stoa Wrapped card, read from the chain.";

const usd = (v: number) => (v >= 1000 ? `$${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K` : `$${v.toLocaleString("en-US", { maximumFractionDigits: v >= 10 ? 0 : 2 })}`);
const num = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M` : v >= 1e3 ? `${(v / 1e3).toLocaleString("en-US", { maximumFractionDigits: 1 })}K` : v.toLocaleString("en-US", { maximumFractionDigits: 0 }));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ED = {
  Classic: { bg: "linear-gradient(160deg,#FFFFFF,#EEF3FB)", edge: "rgba(31,95,176,.25)", accent: BLUE },
  Marble: { bg: "linear-gradient(160deg,#FFFFFF 0%,#F1F3F6 35%,#FFFFFF 55%,#E8ECF2 100%)", edge: "rgba(90,102,120,.35)", accent: BLUE },
  Gold: { bg: "linear-gradient(160deg,#FFF8E4 0%,#F6E3A9 40%,#FFF4D2 60%,#E9C877 100%)", edge: "rgba(176,128,31,.55)", accent: "#8A5A0B" },
} as const;

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const w = isAddress(address) ? await readWrapped(address).catch(() => null) : null;
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public", "logo.png"))).toString("base64")}`;
  const ed = ED[w?.edition ?? "Classic"];
  const stat = (k: string, v: string) => (
    <div style={{ display: "flex", flexDirection: "column", width: "50%", marginTop: 16 }}>
      <span style={{ fontFamily: "Mono", fontSize: 13, letterSpacing: 2, color: MUTED }}>{k}</span>
      <span style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{v}</span>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", padding: "44px 56px", fontFamily: "Inter", color: INK, background: "linear-gradient(115deg,#FFF6E9 0%,#FDEBDD 26%,#E9EEFB 60%,#D6E3FA 100%)" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 560, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src={logo} width={42} height={42} style={{ objectFit: "contain" }} />
            <span style={{ fontFamily: "Marcellus", fontSize: 26, letterSpacing: 8 }}>STOA</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "Mono", fontSize: 16, letterSpacing: 4, color: BLUE }}>STOA WRAPPED · 2026</span>
            <span style={{ fontFamily: "Marcellus", fontSize: 66, lineHeight: 1.05, marginTop: 12 }}>Every route,</span>
            <span style={{ fontFamily: "Marcellus", fontSize: 66, lineHeight: 1.05, color: BLUE }}>compared.</span>
          </div>
          <span style={{ display: "flex", alignSelf: "flex-start", padding: "11px 20px", borderRadius: 999, background: "linear-gradient(135deg,#1F5FB0,#4C97F0)", color: "#fff", fontFamily: "Mono", fontSize: 17 }}>stoadex.com/wrapped</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: "auto", width: 470, height: 540, borderRadius: 28, padding: "28px 30px", background: ed.bg, border: `2px solid ${ed.edge}`, boxShadow: "0 30px 60px rgba(24,32,44,.18)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "Mono", fontSize: 14, letterSpacing: 3, color: MUTED }}>{w ? short(w.address) : "STOA WRAPPED"}</span>
            <span style={{ fontFamily: "Mono", fontSize: 13, letterSpacing: 2, color: ed.accent, border: `1.5px solid ${ed.edge}`, borderRadius: 999, padding: "5px 12px" }}>{(w?.edition ?? "Classic").toUpperCase()} EDITION</span>
          </div>
          {w && w.swaps ? (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 26 }}>
              <span style={{ fontFamily: "Marcellus", fontSize: 72, color: ed.accent, lineHeight: 1 }}>{usd(w.usd)}</span>
              <span style={{ fontSize: 20, color: MUTED, marginTop: 8 }}>{`routed in ${w.swaps} ${w.swaps === 1 ? "swap" : "swaps"}`}</span>
              <div style={{ display: "flex", flexWrap: "wrap", marginTop: 14 }}>
                {stat("FAVORITE VENUE", w.topVenue?.name ?? "—")}
                {stat("TOP TOKEN", w.topToken?.symbol ?? "—")}
                {stat("BIGGEST SWAP", w.biggest ? usd(w.biggest.usd) : "—")}
                {stat("SWAPS REFERRED", String(w.referred))}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 60 }}>
              <span style={{ fontFamily: "Marcellus", fontSize: 54 }}>No swaps yet.</span>
              <span style={{ fontSize: 22, color: MUTED, marginTop: 10 }}>The first one compares every venue Stoa routes.</span>
              {w && w.stoa.held + w.stoa.locked > 0 ? <div style={{ display: "flex", marginTop: 14 }}>{stat("$STOA", num(w.stoa.held + w.stoa.locked))}</div> : null}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
            {(w?.chains ?? []).map((c) => (
              <span key={c.key} style={{ display: "flex", fontSize: 15, padding: "6px 12px", borderRadius: 999, border: `1.5px solid ${ed.edge}`, color: c.swaps ? INK : MUTED }}>{`${c.name} · ${c.swaps}`}</span>
            ))}
          </div>
          <span style={{ marginTop: 14, fontFamily: "Mono", fontSize: 12, letterSpacing: 2, color: MUTED }}>EVERY SWAP CHECKS EVERY VENUE</span>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts(), headers: { "cache-control": "public, max-age=0, s-maxage=600, stale-while-revalidate=600" } },
  );
}

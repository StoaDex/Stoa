import { ImageResponse } from "next/og";
import { isAddress } from "viem";
import { OG_SIZE, ogFonts } from "@/lib/og";
import { netByKey } from "@/lib/networks";
import { readPnl } from "@/lib/pnl";

// Card for /pnl/<chain>/<wallet>: the wallet's profit and loss from swaps through Stoa, read from the chain.
// Never fails: without data it shows a plain card.
export const revalidate = 300;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Profit and loss from swaps through Stoa, read from the chain.";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");

export default async function Image({ params }: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await params;
  const net = netByKey(chain);
  const p = net && isAddress(address, { strict: false }) ? await readPnl(net, address).catch(() => null) : null;
  const total = p ? p.realized + p.unrealized : 0;
  const up = total >= 0;
  const best = p?.rows.length ? [...p.rows].sort((a, b) => (b.realized + (b.unrealized ?? 0)) - (a.realized + (a.unrealized ?? 0)))[0] : null;
  const swaps = p?.rows.reduce((a, r) => a + r.swaps, 0) ?? 0;
  const accent = up ? "#1F7A4D" : "#B4442E";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "56px 64px", fontFamily: "Inter", color: "#16202E", background: up ? "linear-gradient(140deg,#F2FBF5 0%,#E6F4EC 55%,#D5EDE0 100%)" : "linear-gradient(140deg,#FFF5F2 0%,#FBE9E4 55%,#F6DAD2 100%)" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ fontFamily: "Marcellus", fontSize: 30, letterSpacing: 10 }}>STOA</span>
          <span style={{ marginLeft: "auto", fontFamily: "Mono", fontSize: 20, letterSpacing: 3, color: "#3A4658" }}>{`P&L · ${net?.name.toUpperCase() ?? ""}`}</span>
        </div>
        <span style={{ fontFamily: "Mono", fontSize: 24, color: "#3A4658", marginTop: 60 }}>{isAddress(address, { strict: false }) ? short(address) : ""}</span>
        {p && p.rows.length ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 132, fontWeight: 700, lineHeight: 1, color: accent, marginTop: 8 }}>{`${sign(total)}${Math.abs(total).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${p.gas}`}</span>
            <span style={{ fontSize: 34, marginTop: 14 }}>{`${p.gasUsd ? `${sign(total)}$${Math.abs(total * p.gasUsd).toLocaleString("en-US", { maximumFractionDigits: 2 })} · ` : ""}${swaps} ${swaps === 1 ? "swap" : "swaps"} through Stoa`}</span>
            {best && <span style={{ fontSize: 28, marginTop: 10, color: "#3A4658" }}>{`Best: ${best.symbol}${best.pnlPct != null ? ` (${best.pnlPct >= 0 ? "+" : ""}${best.pnlPct.toFixed(1)}%)` : ""}`}</span>}
          </div>
        ) : (
          <span style={{ fontSize: 80, fontWeight: 700, marginTop: 8 }}>Every route, compared.</span>
        )}
        <div style={{ display: "flex", marginTop: "auto", alignItems: "center" }}>
          <span style={{ fontSize: 20, color: "#3A4658" }}>Realized + unrealized, from swaps through Stoa only · not financial advice</span>
          <span style={{ marginLeft: "auto", display: "flex", fontFamily: "Mono", fontSize: 20, padding: "10px 18px", borderRadius: 14, background: "#16202E", color: "#fff" }}>stoadex.com</span>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts(), headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } },
  );
}

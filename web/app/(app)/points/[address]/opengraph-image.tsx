import { ImageResponse } from "next/og";
import { isAddress } from "viem";
import { OG_SIZE, ogFonts } from "@/lib/og";
import { readPoints } from "@/lib/points";

// Card for /points/<wallet>: rank and points in season 1. Never fails: without data it shows the season card.
export const revalidate = 300;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A wallet's Stoa Points and rank in season 1, read from the chain.";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const ok = isAddress(address, { strict: false });
  const b = ok ? await readPoints().catch(() => null) : null;
  const i = b ? b.rows.findIndex((r) => r.address === address.toLowerCase()) : -1;
  const row = i >= 0 ? b!.rows[i] : null;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", fontFamily: "Inter", background: "#FFF8EC", color: "#16202E", position: "relative" }}>
        <div style={{ position: "absolute", right: -140, top: -180, width: 680, height: 680, borderRadius: 999, background: "radial-gradient(circle,#FFD45A 0%,#FFB13D 60%,#FF8A3D 100%)", display: "flex" }} />
        <div style={{ display: "flex", flexDirection: "column", padding: "64px 72px", width: "100%" }}>
          <span style={{ display: "flex", alignSelf: "flex-start", fontFamily: "Mono", fontSize: 20, letterSpacing: 4, padding: "8px 16px", border: "3px solid #16202E", borderRadius: 999, background: "#fff" }}>STOA POINTS · SEASON 1</span>
          <span style={{ fontFamily: "Mono", fontSize: 26, color: "#3A4658", marginTop: 56 }}>{ok ? short(address) : ""}</span>
          {row ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 150, fontWeight: 700, lineHeight: 1, letterSpacing: -4, marginTop: 8 }}>{`${n(row.points)} pts`}</span>
              <span style={{ fontSize: 40, marginTop: 18, color: "#2F6FD6", fontWeight: 600 }}>{`Rank ${i + 1} of ${b!.wallets}`}</span>
            </div>
          ) : (
            <span style={{ fontSize: 96, fontWeight: 700, lineHeight: 1.05, marginTop: 8 }}>Swap. Refer. Climb.</span>
          )}
          <div style={{ display: "flex", marginTop: "auto", alignItems: "center" }}>
            <span style={{ fontSize: 22, color: "#3A4658" }}>No promised value · not a token</span>
            <span style={{ marginLeft: "auto", display: "flex", fontFamily: "Mono", fontSize: 20, padding: "10px 18px", borderRadius: 14, background: "#16202E", color: "#fff" }}>stoadex.com/points</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts(), headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } },
  );
}

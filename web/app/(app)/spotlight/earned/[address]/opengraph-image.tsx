import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { isAddress } from "viem";
import { BLUE, INK, MUTED, OG_SIZE, ogFonts } from "@/lib/og";
import { readEarned } from "@/lib/spotlightEarned";

// Card for /spotlight/earned/<wallet>: the ETH a wallet earned voting in Spotlight. Never fails: without data it shows
// a plain Spotlight card.
export const revalidate = 300;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "ETH earned by voting with $STOA in Stoa Spotlight, read from the chain.";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ethTxt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 4 : 3 });

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const e = isAddress(address, { strict: false }) ? await readEarned(address).catch(() => null) : null;
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public", "logo.png"))).toString("base64")}`;
  const has = !!e && e.eth > 0;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "52px 64px", fontFamily: "Inter", color: INK, background: "radial-gradient(circle at 82% 18%, #FFE7A3 0%, rgba(255,231,163,0) 42%), linear-gradient(125deg,#FFFBF2 0%,#F3F6FD 55%,#DCE8FB 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={logo} width={42} height={42} style={{ objectFit: "contain" }} />
          <span style={{ fontFamily: "Marcellus", fontSize: 26, letterSpacing: 8 }}>STOA</span>
          <span style={{ marginLeft: "auto", fontFamily: "Mono", fontSize: 16, letterSpacing: 4, color: BLUE }}>SPOTLIGHT</span>
        </div>
        <span style={{ fontFamily: "Mono", fontSize: 18, letterSpacing: 3, color: MUTED, marginTop: 70 }}>{isAddress(address, { strict: false }) ? short(address) : "SPOTLIGHT"} {has ? "EARNED" : ""}</span>
        {has ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "Marcellus", fontSize: 128, lineHeight: 1, marginTop: 12, color: "#8A5A0B" }}>{`${ethTxt(e!.eth)} ETH`}</span>
            <span style={{ fontSize: 30, color: INK, marginTop: 18 }}>{`by voting with $STOA · ${e!.weeks} ${e!.weeks === 1 ? "week" : "weeks"} won`}</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "Marcellus", fontSize: 76, lineHeight: 1.05, marginTop: 12 }}>Projects pay ETH.</span>
            <span style={{ fontFamily: "Marcellus", fontSize: 76, lineHeight: 1.05, color: BLUE }}>$STOA holders earn it.</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", marginTop: "auto" }}>
          <span style={{ fontSize: 20, color: MUTED }}>90% of each winning bid goes to its voters, in ETH</span>
          <span style={{ marginLeft: "auto", display: "flex", padding: "11px 20px", borderRadius: 999, background: "linear-gradient(135deg,#1F5FB0,#4C97F0)", color: "#fff", fontFamily: "Mono", fontSize: 17 }}>stoadex.com/spotlight</span>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts(), headers: { "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } },
  );
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BLUE, INK, MUTED, OG_SIZE, ogFonts } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Stoa in three steps: swap, earn, check.";

export default async function Image() {
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public", "logo.png"))).toString("base64")}`;
  const Step = ({ n, h, p }: { n: string; h: string; p: string }) => (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "26px 26px", background: "#fff", borderRadius: 20, border: "2px solid #E3E8F0" }}>
      <span style={{ display: "flex", width: 46, height: 46, borderRadius: 12, background: INK, color: "#fff", alignItems: "center", justifyContent: "center", fontFamily: "Marcellus", fontSize: 26 }}>{n}</span>
      <span style={{ fontFamily: "Marcellus", fontSize: 44, marginTop: 16 }}>{h}</span>
      <span style={{ fontSize: 21, color: MUTED, marginTop: 8, lineHeight: 1.35 }}>{p}</span>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "48px 60px", fontFamily: "Inter", color: INK, background: "linear-gradient(150deg,#FFF8EA 0%,#F4F7FD 55%,#E3EDFC 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={logo} width={40} height={40} style={{ objectFit: "contain" }} />
          <span style={{ fontFamily: "Marcellus", fontSize: 24, letterSpacing: 8 }}>STOA</span>
          <span style={{ marginLeft: "auto", fontFamily: "Mono", fontSize: 16, letterSpacing: 4, color: BLUE }}>START HERE</span>
        </div>
        <span style={{ fontFamily: "Marcellus", fontSize: 64, marginTop: 30, lineHeight: 1 }}>Stoa in three steps</span>
        <div style={{ display: "flex", gap: 18, marginTop: 30 }}>
          <Step n="1" h="Swap" p="Every venue on Robinhood Chain, compared" />
          <Step n="2" h="Earn" p="Points, and Spotlight for $STOA holders" />
          <Step n="3" h="Check" p="Safety checks and open data" />
        </div>
        <div style={{ display: "flex", marginTop: "auto", justifyContent: "flex-end" }}>
          <span style={{ display: "flex", padding: "11px 20px", borderRadius: 999, background: "linear-gradient(135deg,#1F5FB0,#4C97F0)", color: "#fff", fontFamily: "Mono", fontSize: 17 }}>stoadex.com/start</span>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}

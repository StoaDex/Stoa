import { ImageResponse } from "next/og";
import { BLUE, MUTED, OG_SIZE, OgFrame, ogFonts } from "@/lib/og";

// Link card for /spotlight/projects (static).
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Spotlight for projects: bid ETH for one of three sponsored slots on Stoa for a week. Lose, and your bid comes back.";

export default async function Image() {
  const cells: [string, string, string][] = [
    ["3 SLOTS", "a week", "Trade, Launches and Tokens"],
    ["FROM 0.01 ETH", "first bid", "plus a 0.001 ETH entry fee"],
    ["LOSE?", "full refund", "of your bid, once the week settles"],
  ];
  return new ImageResponse(
    (
      <OgFrame url="stoadex.com/spotlight/projects" foot="BIDS MON 00:00 TO SAT 00:00 UTC · 1M $STOA OF VOTES TO WIN">
        <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
          <span style={{ fontFamily: "Mono", fontSize: 18, letterSpacing: 6, color: BLUE }}>SPOTLIGHT · FOR PROJECTS</span>
          <span style={{ fontFamily: "Marcellus", fontSize: 60, lineHeight: 1.08, marginTop: 10 }}>Put your token in front of</span>
          <span style={{ fontFamily: "Marcellus", fontSize: 60, lineHeight: 1.08, color: BLUE }}>every Stoa trader.</span>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 32 }}>
          {cells.map(([k, v, s]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", flex: 1, background: "rgba(255,255,255,.95)", borderRadius: 22, padding: "18px 22px", boxShadow: "0 16px 36px rgba(24,32,44,.10)" }}>
              <span style={{ fontFamily: "Mono", fontSize: 14, letterSpacing: 3, color: MUTED }}>{k}</span>
              <span style={{ fontSize: 34, fontWeight: 700, marginTop: 8 }}>{v}</span>
              <span style={{ fontSize: 17, color: MUTED, marginTop: 4 }}>{s}</span>
            </div>
          ))}
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}

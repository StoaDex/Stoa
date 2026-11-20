import { ImageResponse } from "next/og";
import { BLUE, MUTED, OG_SIZE, OgFrame, ogFonts } from "@/lib/og";
import { SPOT_START, epochAt, utc } from "@/lib/spotlight";

// Link card for /spotlight: what it is, and the week in progress (or when week 1 opens).
export const revalidate = 300;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Stoa Spotlight: projects bid ETH for sponsored slots, $STOA holders vote and earn the winning bids.";

export default async function Image() {
  const now = Math.floor(Date.now() / 1000);
  const e = epochAt(now);
  const foot = e < 0 ? `WEEK 1 OPENS ${utc(SPOT_START).toUpperCase()}` : `WEEK ${e + 1} IS OPEN · ROBINHOOD CHAIN`;
  const steps: [string, string, string][] = [
    ["1", "Projects bid ETH", "for 3 sponsored slots a week"],
    ["2", "Holders lock $STOA", "and vote for the projects"],
    ["3", "90% to voters", "10% buys $STOA and burns it"],
  ];
  return new ImageResponse(
    (
      <OgFrame url="stoadex.com/spotlight" foot={foot}>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
          <span style={{ fontFamily: "Mono", fontSize: 18, letterSpacing: 6, color: BLUE }}>SPOTLIGHT</span>
          <span style={{ fontFamily: "Marcellus", fontSize: 66, lineHeight: 1.05, marginTop: 10 }}>Projects pay ETH.</span>
          <span style={{ fontFamily: "Marcellus", fontSize: 66, lineHeight: 1.05, color: BLUE }}>$STOA holders earn it.</span>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 34 }}>
          {steps.map(([n, t, s]) => (
            <div key={n} style={{ display: "flex", flexDirection: "column", flex: 1, background: "rgba(255,255,255,.95)", borderRadius: 22, padding: "18px 22px", boxShadow: "0 16px 36px rgba(24,32,44,.10)" }}>
              <span style={{ display: "flex", width: 34, height: 34, borderRadius: 999, background: BLUE, color: "#fff", alignItems: "center", justifyContent: "center", fontFamily: "Mono", fontSize: 16 }}>{n}</span>
              <span style={{ fontSize: 28, fontWeight: 700, marginTop: 10 }}>{t}</span>
              <span style={{ fontSize: 18, color: MUTED, marginTop: 4 }}>{s}</span>
            </div>
          ))}
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}

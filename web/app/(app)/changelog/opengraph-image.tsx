import { ImageResponse } from "next/og";
import { BLUE, MUTED, OG_SIZE, OgFrame, ogFonts } from "@/lib/og";
import { CHANGES, fmtDate } from "@/lib/changelog";

// Card for links to /changelog: the latest releases with their dates.
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Stoa changelog: every release, dated.";

export default async function Image() {
  const latest = CHANGES.slice(0, 4);
  const first = CHANGES[CHANGES.length - 1];
  return new ImageResponse(
    (
      <OgFrame url="stoadex.com/changelog" foot={`${CHANGES.length} RELEASES SINCE ${fmtDate(first.date).toUpperCase()}`}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 30 }}>
          <span style={{ fontFamily: "Marcellus", fontSize: 60 }}>What we shipped,</span>
          <span style={{ fontFamily: "Marcellus", fontSize: 60, color: BLUE }}>dated.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
          {latest.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 22, background: "rgba(255,255,255,.95)", borderRadius: 18, padding: "14px 22px", boxShadow: "0 12px 28px rgba(24,32,44,.08)" }}>
              <span style={{ fontFamily: "Mono", fontSize: 15, letterSpacing: 2, color: MUTED, width: 140 }}>{fmtDate(c.date).toUpperCase()}</span>
              <span style={{ fontSize: 24, fontWeight: 700, flex: 1 }}>{c.title}</span>
              <span style={{ fontFamily: "Mono", fontSize: 13, letterSpacing: 1, color: BLUE, background: "#EAF1FB", borderRadius: 8, padding: "5px 10px" }}>{c.tag}</span>
            </div>
          ))}
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}

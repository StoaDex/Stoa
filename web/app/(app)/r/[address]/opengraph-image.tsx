import { ImageResponse } from "next/og";
import { isAddress } from "viem";
import { OG_SIZE, ogFonts } from "@/lib/og";

// The invite card for /r/<wallet>: a ticket with the inviter's short address. Static, so it never fails.
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "An invite to swap on Stoa, on Robinhood Chain.";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const who = isAddress(address, { strict: false }) ? short(address) : "a friend";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", background: "linear-gradient(135deg,#E8F1FF 0%,#F7F2FF 50%,#FFF4E6 100%)" }}>
        <div style={{ display: "flex", width: 1040, height: 470, borderRadius: 36, background: "#fff", boxShadow: "0 30px 70px rgba(30,50,90,.18)", overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column", padding: "52px 56px", width: 720, color: "#16202E" }}>
            <span style={{ fontFamily: "Mono", fontSize: 20, letterSpacing: 5, color: "#2F6FD6" }}>{`INVITE · FROM ${who}`}</span>
            <span style={{ fontFamily: "Marcellus", fontSize: 86, lineHeight: 1.02, marginTop: 26 }}>Swap on Stoa</span>
            <span style={{ fontSize: 30, color: "#3A4658", marginTop: 18, lineHeight: 1.3 }}>Every route compared for your amount, on Robinhood Chain.</span>
            <div style={{ display: "flex", gap: 12, marginTop: "auto" }}>
              {["Stock tokens 24/7", "Safety check", "Earn Points"].map((t) => (
                <span key={t} style={{ display: "flex", fontSize: 20, padding: "10px 16px", borderRadius: 999, background: "#EEF4FD", color: "#1F5FB0" }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 320, background: "#16202E", color: "#fff", borderLeft: "4px dashed #fff" }}>
            <span style={{ fontFamily: "Marcellus", fontSize: 44, letterSpacing: 10 }}>STOA</span>
            <span style={{ fontFamily: "Mono", fontSize: 22, marginTop: 22, color: "#FFD45A" }}>2 bps fee</span>
            <span style={{ fontFamily: "Mono", fontSize: 18, marginTop: 30, color: "#9AA8C2" }}>stoadex.com</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}

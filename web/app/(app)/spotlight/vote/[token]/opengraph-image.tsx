import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { isAddress } from "viem";
import { BLUE, INK, MUTED, OG_SIZE, ogFonts } from "@/lib/og";
import { ethTxt, readVote, stoaTxt, utcTxt } from "@/lib/spotlightVote";

// Card for /spotlight/vote/<token>: "Vote for X", its bid, its votes against the quorum, when votes close. Never fails:
// without data it shows a plain Spotlight card.
export const revalidate = 120;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A Stoa Spotlight candidate: its ETH bid and its $STOA votes, read from the chain.";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = isAddress(token, { strict: false }) ? await readVote(token).catch(() => null) : null;
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public", "logo.png"))).toString("base64")}`;
  const pct = v && v.quorumStoa > 0 ? Math.min(100, (v.votesStoa / v.quorumStoa) * 100) : 0;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "52px 64px", fontFamily: "Inter", color: INK, background: "radial-gradient(circle at 15% 85%, #D9F2E4 0%, rgba(217,242,228,0) 45%), linear-gradient(120deg,#F3F6FD 0%,#FFFBF2 60%,#FFF1D6 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={logo} width={42} height={42} style={{ objectFit: "contain" }} />
          <span style={{ fontFamily: "Marcellus", fontSize: 26, letterSpacing: 8 }}>STOA</span>
          <span style={{ marginLeft: "auto", fontFamily: "Mono", fontSize: 16, letterSpacing: 4, color: BLUE }}>{v ? `SPOTLIGHT · WEEK ${v.week}` : "SPOTLIGHT"}</span>
        </div>
        {v ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 48 }}>
            <span style={{ fontFamily: "Mono", fontSize: 20, letterSpacing: 4, color: MUTED }}>VOTE FOR</span>
            <span style={{ fontFamily: "Marcellus", fontSize: v.symbol.length > 9 ? 92 : 124, lineHeight: 1, marginTop: 8 }}>{`$${v.symbol}`}</span>
            <div style={{ display: "flex", gap: 40, marginTop: 34, alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontFamily: "Mono", fontSize: 16, letterSpacing: 3, color: MUTED }}>BID</span><span style={{ fontSize: 44, fontWeight: 700, color: "#8A5A0B" }}>{`${ethTxt(v.bidEth)} ETH`}</span></div>
              <div style={{ display: "flex", flexDirection: "column", width: 520 }}>
                <span style={{ fontFamily: "Mono", fontSize: 16, letterSpacing: 3, color: MUTED }}>{`VOTES ${stoaTxt(v.votesStoa)} / ${stoaTxt(v.quorumStoa)} $STOA`}</span>
                <div style={{ display: "flex", height: 18, borderRadius: 9, background: "rgba(47,111,214,.15)", marginTop: 12 }}><div style={{ display: "flex", width: `${Math.max(2, pct)}%`, height: 18, borderRadius: 9, background: BLUE }} /></div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 70 }}>
            <span style={{ fontFamily: "Marcellus", fontSize: 76, lineHeight: 1.05 }}>Projects pay ETH.</span>
            <span style={{ fontFamily: "Marcellus", fontSize: 76, lineHeight: 1.05, color: BLUE }}>$STOA holders earn it.</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", marginTop: "auto" }}>
          <span style={{ fontSize: 20, color: MUTED }}>{v ? `If it wins, ${v.toVotersPct}% of the bid goes to its voters · votes close ${utcTxt(v.votesCloseAt)}` : "90% of each winning bid goes to its voters, in ETH"}</span>
          <span style={{ marginLeft: "auto", display: "flex", padding: "11px 20px", borderRadius: 999, background: "linear-gradient(135deg,#1F5FB0,#4C97F0)", color: "#fff", fontFamily: "Mono", fontSize: 17 }}>stoadex.com/spotlight</span>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts(), headers: { "cache-control": "public, max-age=0, s-maxage=120, stale-while-revalidate=600" } },
  );
}

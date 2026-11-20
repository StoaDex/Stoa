import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";

// Shared frame for the per-page social cards (X, Telegram, Discord previews). Same look as the posts:
// warm-to-blue gradient, Marcellus headings, JetBrains Mono labels. Fonts are bundled (OFL) in assets/fonts.

export const OG_SIZE = { width: 1200, height: 630 };
const root = process.cwd();

export async function ogFonts() {
  const f = (n: string) => readFile(join(root, "assets/fonts", n));
  const [marcellus, inter5, inter7, mono] = await Promise.all([f("Marcellus.ttf"), f("Inter-wght-500.ttf"), f("Inter-wght-700.ttf"), f("JetBrains-Mono-wght-500.ttf")]);
  return [
    { name: "Marcellus", data: marcellus, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: inter5, weight: 500 as const, style: "normal" as const },
    { name: "Inter", data: inter7, weight: 700 as const, style: "normal" as const },
    { name: "Mono", data: mono, weight: 500 as const, style: "normal" as const },
  ];
}

async function dataUrl(rel: string) {
  const type = rel.endsWith(".svg") ? "image/svg+xml" : "image/png";
  return `data:${type};base64,${(await readFile(join(root, "public", rel))).toString("base64")}`;
}

export const BLUE = "#1F5FB0";
export const INK = "#18202C";
export const MUTED = "#5A6678";

export async function OgFrame({ children, url, foot, network = "robinhood" }: { children: ReactNode; url: string; foot: string; network?: "robinhood" | "elysium" }) {
  const [logo, rh] = await Promise.all([dataUrl("logo.png"), dataUrl(network === "elysium" ? "networks/elysium.svg" : "networks/robinhood.png")]);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "40px 56px 34px", fontFamily: "Inter", color: INK, background: "linear-gradient(115deg,#FFF6E9 0%,#FDEBDD 26%,#E9EEFB 60%,#D6E3FA 100%)", position: "relative" }}>
      <div style={{ position: "absolute", right: -160, top: -220, width: 640, height: 640, borderRadius: 999, background: "radial-gradient(circle,rgba(255,226,170,.8),rgba(255,214,160,0) 70%)", display: "flex" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={logo} width={42} height={42} style={{ objectFit: "contain" }} />
          <span style={{ fontFamily: "Marcellus", fontSize: 26, letterSpacing: 8 }}>STOA</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px 8px 8px", borderRadius: 999, background: "rgba(255,255,255,.92)", fontFamily: "Mono", fontSize: 14, letterSpacing: 2 }}>
          <img src={rh} width={28} height={28} style={{ borderRadius: 8 }} />
          {network === "elysium" ? "ELYSIUM" : "ROBINHOOD CHAIN"}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>{children}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "Mono", fontSize: 15, letterSpacing: 2, color: MUTED }}>{foot}</span>
        <span style={{ display: "flex", padding: "11px 20px", borderRadius: 999, background: "linear-gradient(135deg,#1F5FB0,#4C97F0)", color: "#fff", fontFamily: "Mono", fontSize: 17 }}>{url}</span>
      </div>
    </div>
  );
}

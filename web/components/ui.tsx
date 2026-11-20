import type { ReactNode } from "react";
import type { Token } from "@/lib/tokens";

/** compact: on phones the heading is kept for screen readers and search but not drawn, so the tool comes first */
export function PageHead({ eyebrow, title, children, action, compact }: { eyebrow: string; title: string; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={compact ? "ph ph-c" : "ph"}>
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{children && <p>{children}</p>}</div>
      {action}
    </div>
  );
}

export function TokenIcon({ t }: { t: Pick<Token, "glyph" | "tone" | "logo"> }) {
  const cls = t.tone === "native" ? "n" : t.tone === "hype" ? "h" : t.tone === "usd" ? "u" : "";
  // eslint-disable-next-line @next/next/no-img-element
  // a logo that fails to load falls back to the glyph underneath it
  if (t.logo) return (
    <span className="ti" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(135deg,#6B7482,#A9B2C0)" }}>
      {t.glyph}
      <img className="ti img" src={t.logo} alt="" width={26} height={26} loading="lazy" style={{ position: "absolute", inset: 0 }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
    </span>
  );
  return <span className={`ti ${cls}`} style={t.tone === "other" ? { background: "linear-gradient(135deg,#6B7482,#A9B2C0)" } : undefined}>{t.glyph}</span>;
}

export function Pair() {
  // eslint-disable-next-line @next/next/no-img-element
  return <div className="pair"><img className="ti img" src="/tokens/hype.svg" alt="" width={26} height={26} /><img className="ti img" src="/tokens/usdc.svg" alt="" width={26} height={26} />WHYPE / USDC</div>;
}

export const Sk = ({ w = 80 }: { w?: number }) => <i className="sk" style={{ width: w }} />;

// a ticker badge in one of a few soft colors, picked from the ticker so it stays the same everywhere
const TONES = ["#E8F0FD:#1F5FB0", "#EAF6EE:#1E7A45", "#FDF1E4:#A55A12", "#F3ECFB:#6B3FA8", "#FCEBEC:#B23A3F", "#E9F5F7:#17707E", "#F4F1E6:#76651E"];
export function Ticker({ symbol, size = 30 }: { symbol: string; size?: number }) {
  let h = 0;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [bg, fg] = TONES[h % TONES.length].split(":");
  const t = symbol.slice(0, 4);
  return <span className="ticker" aria-hidden="true" style={{ width: size, height: size, background: bg, color: fg, fontSize: t.length <= 2 ? size * 0.4 : t.length === 3 ? size * 0.33 : size * 0.28 }}>{t}</span>;
}

"use client";
import { useQuery } from "@tanstack/react-query";
import type { Safety } from "@/lib/safety";
import SafetyShare from "@/components/SafetyShare";

const VERDICT: Record<Safety["verdict"], { label: string; style: React.CSSProperties }> = {
  ok: { label: "Passed", style: { background: "#E7F4EC", color: "#1F7A4D" } },
  caution: { label: "Caution", style: { background: "#FFF3DF", color: "#9A5B0B" } },
  danger: { label: "Risky", style: { background: "#FDECEA", color: "#B4442E" } },
  unknown: { label: "Not checked", style: {} },
};
const p = (v: number | null | undefined, dp = 1) => (v === null || v === undefined ? "—" : `${v.toFixed(dp)}%`);

/** A test buy and sell of the token through the live router (simulated, nothing is sent), with how concentrated its
 *  supply is. Shown on Trade for unverified tokens and on each Pons token's page. */
export default function SafetyPanel({ chain, token, compact = false }: { chain: string; token: string; compact?: boolean }) {
  const q = useQuery({
    queryKey: ["safety", chain, token.toLowerCase()],
    staleTime: 120_000,
    retry: 1,
    queryFn: async () => {
      const r = await fetch(`/api/safety/${chain}/${token}`);
      if (!r.ok) throw new Error("unavailable");
      return (await r.json()) as Safety;
    },
  });
  const s = q.data;
  const v = VERDICT[s?.verdict ?? "unknown"];
  const t = s?.test;
  return (
    <div className={compact ? "safety compact" : "panel pad safety"} style={compact ? { marginTop: 12 } : { marginBottom: 16 }}>
      <div className="rowx">
        <span className="lbl">SAFETY CHECK</span>
        <span className="chip" style={v.style}>{q.isLoading ? "Checking…" : q.isError ? "Unavailable" : v.label}</span>
      </div>
      {q.isError && <p className="note">The check could not run right now. Trade with care, and try again in a minute.</p>}
      {s && (
        <>
          <div className="det" style={{ marginTop: 8 }}>
            <span>Test sell after a test buy</span><span>{!t ? "—" : t.sellOk ? "works" : t.buyOk ? <b style={{ color: "#B4442E" }}>failed</b> : "not run"}</span>
            {t?.sellOk && <><span>Hidden tax, buy · sell</span><span>{t.buyTaxPct && t.buyTaxPct >= 0.1 ? p(t.buyTaxPct) : "none"} · {t.sellTaxPct && t.sellTaxPct >= 0.1 ? p(t.sellTaxPct) : "none"}</span></>}
            {t?.sellOk && t.roundTripPct !== null && <><span>Buy and sell back at once</span><span>{t.roundTripPct > 0 ? "+" : ""}{t.roundTripPct.toFixed(2)}%</span></>}
            {s.creatorPct !== null && <><span>Creator wallet holds</span><span>{p(s.creatorPct)} of supply</span></>}
            {s.top10Pct !== null && <><span>Ten largest wallets hold</span><span>{p(s.top10Pct)} of supply</span></>}
          </div>
          {s.notes.length > 0 && <ul className="safety-notes">{s.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          <p className="note">
            A test trade of {t ? `${Number(t.amountIn) / 1e18} ${t.gas}` : "a small amount"} through Stoa&apos;s router, simulated on the live chain: nothing is sent. Buying and selling back includes pool fees and price impact. It checks today&apos;s behavior; a token&apos;s owner can still change it later.
          </p>
          <SafetyShare s={s} />
        </>
      )}
    </div>
  );
}

"use client";
import { useQuery } from "@tanstack/react-query";
import type { RouterStats as Stats } from "@/lib/routerStats";
import { useNet } from "./Providers";
import { Sk } from "./ui";

/** Router activity on the selected network: USD volume and swaps over 24 hours, and swaps since launch. Read from
 *  /api/stats (the routers' on-chain events, counted on the server and CDN-cached 5 minutes), the same numbers as
 *  the Stats page. */
export default function RouterStats() {
  const net = useNet();
  const live = !!net.contracts.router;
  const q = useQuery({
    queryKey: ["router-stats"],
    queryFn: async () => {
      const r = await fetch("/api/stats");
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as Stats;
    },
    enabled: live, refetchInterval: 300_000, staleTime: 240_000, retry: 2,
  });
  const c = q.data?.chains.find((x) => x.key === net.key);
  const usd = (v: number) => (v >= 1000 ? "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "$" + v.toFixed(2));
  const show = (v?: string) => (!live ? "At launch" : v ?? (q.isError ? "—" : <Sk w={70} />));
  const cell = (label: string, v: React.ReactNode) => (
    <div className="panel pad">
      <div className="lbl">{label}</div>
      <div style={{ fontFamily: "var(--num)", fontSize: 26, marginTop: 6 }}>{v}</div>
    </div>
  );
  return (
    <div className="grid3 stats" style={{ marginBottom: 20 }}>
      {cell("VOLUME · 24H", show(c && usd(c.usd24h)))}
      {cell("SWAPS · 24H", show(c?.swaps24h.toLocaleString("en-US")))}
      {cell("SWAPS · ALL TIME", show(c?.swaps.toLocaleString("en-US")))}
    </div>
  );
}

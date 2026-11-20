"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { RouterStats } from "@/lib/routerStats";
import { ROBINHOOD, txUrlOn } from "@/lib/networks";
import { buybackAbi } from "@/lib/abi";
import { getLogsOn } from "@/lib/logs";
import { CHANGES } from "@/lib/changelog";
import { SPOT_START, WEEK, epochAt } from "@/lib/spotlight";
import { readEpoch, tokenMeta, useNow } from "./spotlightData";
import { Sk } from "./ui";

const net = ROBINHOOD;
const DAY = 86400;
const usd = (v: number) => (v >= 1000 ? "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "$" + v.toFixed(2));
const stoaTxt = (v: bigint) => Number(v / 10n ** 18n).toLocaleString("en-US");
const ethTxt = (v: bigint) => (Number(v) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 4 });
const dayTxt = (t: number) => new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Monday 00:00 UTC of the week `t` is in */
function weekStart(t: number) {
  const day = Math.floor(t / DAY);
  const dow = (new Date(day * DAY * 1000).getUTCDay() + 6) % 7; // Monday 0
  return (day - dow) * DAY;
}

function Cell({ label, v, sub }: { label: string; v?: string; sub?: string }) {
  return (
    <div className="panel pad">
      <div className="lbl">{label}</div>
      <div style={{ fontFamily: "var(--num)", fontSize: 24, marginTop: 6 }}>{v ?? <Sk w={110} />}</div>
      {sub && <p className="note" style={{ marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

/** One week on Stoa, Monday to Sunday UTC: volume and swaps, $STOA bought and burned, the Spotlight week that closed,
 *  and what shipped. Everything is read from the routers' events, the buyback contract, SpotlightMarket and the
 *  changelog. */
export default function WeeklyBody() {
  const now = useNow(60_000);
  const [which, setWhich] = useState<"this" | "last">("this");
  const pub = usePublicClient({ chainId: net.chain.id });

  const stats = useQuery({
    queryKey: ["router-stats"],
    queryFn: async () => {
      const r = await fetch("/api/stats");
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as RouterStats;
    },
    staleTime: 240_000, retry: 2,
  });
  const burns = useQuery({
    queryKey: ["weekly-burns"],
    enabled: !!pub && !!net.contracts.buyback,
    staleTime: 300_000,
    queryFn: async () => {
      const logs = (await getLogsOn(net, { address: net.contracts.buyback!, event: buybackAbi[2], fromBlock: net.deployBlock })) as unknown as { blockNumber: bigint; transactionHash: string; args: { stoaBurned: bigint } }[];
      const times = await Promise.all(logs.map((l) => pub!.getBlock({ blockNumber: l.blockNumber }).then((b) => Number(b.timestamp))));
      return logs.map((l, i) => ({ time: times[i], hash: l.transactionHash, burned: l.args.stoaBurned }));
    },
  });

  const start = now ? weekStart(now) - (which === "last" ? 7 * DAY : 0) : 0;
  const end = start + 7 * DAY;
  // the Spotlight week that runs over these same seven days (Spotlight weeks also start Monday 00:00 UTC)
  const epoch = now ? epochAt(start) : -1;
  const spot = useQuery({
    queryKey: ["weekly-spot", epoch],
    enabled: !!pub && !!net.contracts.spotlight && epoch >= 0,
    staleTime: 120_000,
    queryFn: async () => {
      const ep = await readEpoch(pub!, epoch);
      const meta = await tokenMeta(pub!, ep.candidates.map((c) => c.token));
      return { ep, meta };
    },
  });

  if (!now) return <Sk w={240} />;
  const days = (stats.data?.days ?? []).filter((d) => { const t = Date.parse(`${d.date}T00:00:00Z`) / 1000; return t >= start && t < end; });
  const vol = days.reduce((a, d) => a + Object.values(d.chains).reduce((x, c) => x + c.usd, 0), 0);
  const swaps = days.reduce((a, d) => a + Object.values(d.chains).reduce((x, c) => x + c.swaps, 0), 0);
  const perChain = stats.data?.chains.map((c) => `${c.name.replace(" Chain", "")} ${usd(days.reduce((a, d) => a + (d.chains[c.key]?.usd ?? 0), 0))}`).join(" · ");
  const weekBurns = (burns.data ?? []).filter((b) => b.time >= start && b.time < end);
  const burned = weekBurns.reduce((a, b) => a + b.burned, 0n);
  const shipped = CHANGES.filter((c) => { const t = Date.parse(`${c.date}T00:00:00Z`) / 1000; return t >= start && t < end; });
  const ep = spot.data?.ep;
  const range = `${dayTxt(start)} – ${dayTxt(end - DAY)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="rowx">
        <div className="seg" role="tablist" aria-label="Week">
          <button type="button" role="tab" aria-selected={which === "this"} className={which === "this" ? "on" : undefined} onClick={() => setWhich("this")}>This week</button>
          <button type="button" role="tab" aria-selected={which === "last"} className={which === "last" ? "on" : undefined} onClick={() => setWhich("last")}>Last week</button>
        </div>
        <span className="chip">{range} (UTC){which === "this" ? " · so far" : ""}</span>
      </div>

      <div className="grid3 sgrid">
        <Cell label="VOLUME THROUGH STOA" v={stats.data ? usd(vol) : stats.isError ? "—" : undefined} sub={stats.data ? `${swaps.toLocaleString("en-US")} swap${swaps === 1 ? "" : "s"} · ${perChain}` : undefined} />
        <Cell label="$STOA BOUGHT AND BURNED" v={burns.data ? stoaTxt(burned) : burns.isError ? "—" : undefined} sub={burns.data ? (weekBurns.length ? `${weekBurns.length} buyback${weekBurns.length === 1 ? "" : "s"}, from protocol fees` : "Weekly buyback runs Mondays, 13:41 UTC") : undefined} />
        <Cell label="SHIPPED" v={`${shipped.length} update${shipped.length === 1 ? "" : "s"}`} sub="From the changelog" />
      </div>

      {weekBurns.length > 0 && (
        <div className="panel pad">
          <div className="lbl">BUYBACKS</div>
          <ul className="list">{weekBurns.map((b) => <li key={b.hash}>{dayTxt(b.time)} <b>{stoaTxt(b.burned)} $STOA burned · <a href={txUrlOn(net, b.hash)} target="_blank" rel="noopener noreferrer">tx</a></b></li>)}</ul>
        </div>
      )}

      <div className="panel pad">
        <div className="rowx"><div className="lbl">SPOTLIGHT</div><Link className="chip" href="/spotlight">Open Spotlight</Link></div>
        {epoch < 0 ? (
          <p style={{ marginTop: 10 }}>Spotlight week 1 opens {dayTxt(SPOT_START)}, 00:00 UTC.</p>
        ) : !ep ? <Sk w={200} /> : (
          <>
            <p style={{ marginTop: 10 }}>
              Week {epoch + 1}: {ep.candidates.length} token{ep.candidates.length === 1 ? "" : "s"} bid
              {ep.finalized ? (ep.winners.length ? `, ${ep.winners.length} won.` : ", none reached the vote quorum, so every bid was refunded.") : now < SPOT_START + (epoch + 1) * WEEK ? ", still open." : ", closed and waiting to be settled."}
            </p>
            {ep.candidates.length > 0 && (
              <ul className="list">
                {[...ep.candidates].sort((a, b) => (b.pot > a.pot ? 1 : -1)).map((c) => (
                  <li key={c.token}>{spot.data?.meta[c.token.toLowerCase()]?.symbol ?? `${c.token.slice(0, 6)}…`}{c.won ? " · won" : ""}
                    <b>{ethTxt(c.pot)} ETH bid · {stoaTxt(c.votes)} $STOA votes{c.won ? ` · ${ethTxt(c.payout)} ETH to voters` : ""}</b></li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="panel pad">
        <div className="lbl">SHIPPED THIS WEEK</div>
        {shipped.length === 0 ? <p className="note">Nothing in the changelog for these days yet.</p> : (
          <ul className="list">
            {shipped.slice(0, 12).map((c) => (
              <li key={c.id}>{c.link ? <Link href={c.link.href}>{c.title}</Link> : c.title}<b>{dayTxt(Date.parse(`${c.date}T00:00:00Z`) / 1000)} · {c.tag}</b></li>
            ))}
          </ul>
        )}
        {shipped.length > 12 && <p className="note" style={{ marginTop: 8 }}>And {shipped.length - 12} more.</p>}
        <p className="note" style={{ marginTop: 10 }}>Every update in full: <Link href="/changelog">changelog</Link>. Volume and swaps: <Link href="/stats">stats</Link>.</p>
      </div>
    </div>
  );
}

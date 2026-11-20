"use client";
import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { ROBINHOOD } from "@/lib/networks";
import { usePrices, fmtUsd } from "@/lib/prices";
import { HOUSE_BID, SPOT, spotlightAbi } from "@/lib/spotlight";
import type { SpotEpoch, SpotTokenMeta } from "./spotlightData";

const net = ROBINHOOD;
const E18 = 10n ** 18n;
const M = 10n ** 24n;
const num = (s: string) => s.replace(/,/g, ".").replace(/[^0-9.]/g, "");
const toWei = (s: string) => { try { return s && Number(s) > 0 ? parseUnits(s, 18) : 0n; } catch { return 0n; } };
const ethTxt = (v: bigint) => { const n = Number(formatUnits(v, 18)); return n === 0 ? "0" : n < 0.0001 ? "<0.0001" : n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 4 : 3 }); };
const stoaTxt = (v: bigint) => Number(v / E18).toLocaleString("en-US");

/** what a voter's share of one winning bid comes to: 90% of the pot, split by votes (SpotlightMarket.claimable) */
export const shareOf = (pot: bigint, cutBps: number, votes: bigint, mine: bigint) => (mine === 0n ? 0n : ((pot - (pot * BigInt(cutBps)) / 10_000n) * mine) / (votes + mine));

/** "If I lock X $STOA, what could I get?": this week's live bids, or a what-if when none are in yet */
export default function SpotlightCalc({ cur, meta, week }: { cur?: SpotEpoch; meta?: Record<string, SpotTokenMeta>; week: number }) {
  const { address } = useAccount();
  const acct = useReadContract({ address: SPOT, abi: spotlightAbi, functionName: "accounts", args: address ? [address] : undefined, chainId: net.chain.id, query: { enabled: !!address && !!SPOT } });
  const locked = (acct.data as readonly [bigint, bigint, bigint] | undefined)?.[0] ?? 0n;
  const price = usePrices(net, [net.tokens[0]]);
  const ethUsd = price(net.tokens[0])?.usd ?? 0;
  const house = week >= HOUSE_BID.fromWeek && week <= HOUSE_BID.toWeek;

  const [stoa, setStoa] = useState("100000");
  const [bid, setBid] = useState(String(house ? HOUSE_BID.eth : 0.1));
  const [others, setOthers] = useState("1000000");
  const mine = toWei(stoa);
  const cutBps = cur?.params.cutBps ?? 1000;
  const quorum = cur?.params.quorum ?? M;
  const usd = (v: bigint) => (ethUsd > 0 && v > 0n ? ` ≈ ${fmtUsd(Number(formatUnits(v, 18)) * ethUsd)}` : "");

  const live = (cur?.candidates ?? []).filter((c) => !c.canceled && c.pot > 0n).sort((a, b) => (b.pot > a.pot ? 1 : b.pot < a.pot ? -1 : 0));
  const whatIf = shareOf(toWei(bid), cutBps, toWei(others), mine);
  const otherVotes = toWei(others);
  const pctOf = (votes: bigint) => (mine === 0n ? 0 : Number((mine * 10_000n) / (votes + mine)) / 100);

  const field = (id: string, label: string, v: string, set: (s: string) => void, unit: string) => (
    <label htmlFor={id} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span className="note" style={{ margin: 0 }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", background: "#fff" }}>
        <input id={id} type="text" inputMode="decimal" autoComplete="off" value={v} onChange={(e) => set(num(e.target.value))}
          style={{ border: 0, outline: 0, width: "100%", minWidth: 0, fontFamily: "var(--num)", fontSize: 18, background: "transparent" }} />
        <small style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{unit}</small>
      </span>
    </label>
  );

  return (
    <div className="panel pad" id="calc">
      <div className="lbl">WHAT COULD MY $STOA EARN?</div>
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {field("calc-stoa", "$STOA you lock and vote with", stoa, setStoa, "$STOA")}
        {locked > 0n && (
          <button type="button" className="ghost" style={{ justifySelf: "start" }} onClick={() => setStoa(formatUnits(locked, 18))}>
            Use my locked {stoaTxt(locked)} $STOA
          </button>
        )}
      </div>

      {live.length > 0 && (
        <>
          <p className="note" style={{ marginTop: 14 }}>Week {week} bids right now. If all your votes go to one token and it wins:</p>
          <ul className="list" style={{ marginTop: 6 }}>
            {live.map((c) => {
              const sym = meta?.[c.token.toLowerCase()]?.symbol ?? `${c.token.slice(0, 6)}…`;
              const get = shareOf(c.pot, cutBps, c.votes, mine);
              const short = c.votes + mine < quorum ? quorum - c.votes - mine : 0n;
              return (
                <li key={c.token}>
                  <span style={{ minWidth: 0 }}>
                    {sym}
                    <small style={{ display: "block", color: "var(--muted)" }}>Bid {ethTxt(c.pot)} ETH · {stoaTxt(c.votes)} votes{short > 0n ? ` · needs ${stoaTxt(short)} more to reach the quorum` : ""}</small>
                  </span>
                  <b>{ethTxt(get)} ETH{usd(get)}</b>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="note" style={{ marginTop: 14 }}>{live.length ? "Or try your own numbers:" : `No bids are in yet${house ? `. Weeks ${HOUSE_BID.fromWeek}–${HOUSE_BID.toWeek} have a ${HOUSE_BID.eth} ETH house bid from Stoa` : ""}. Try a bid:`}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {field("calc-bid", "Winning bid", bid, setBid, "ETH")}
        {field("calc-others", "Other votes on it", others, setOthers, "$STOA")}
      </div>
      <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, background: "rgba(47,111,214,.08)" }}>
        <div className="note" style={{ margin: 0 }}>You would get</div>
        <div style={{ fontFamily: "var(--num)", fontSize: 26 }}>{ethTxt(whatIf)} ETH<small style={{ fontSize: 14, color: "var(--muted)" }}>{usd(whatIf)}</small></div>
        <div className="note" style={{ margin: "2px 0 0" }}>{pctOf(otherVotes).toFixed(2)}% of the votes on that token, times {100 - cutBps / 100}% of its bid</div>
      </div>
      <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
        An estimate, not a promise: you earn only if the token you vote for wins (one of the {cur?.params.slots ?? 3} largest bids with at least {stoaTxt(quorum)} $STOA of votes), and more votes on it shrink your share. Projects decide what is bid. Not financial advice.
      </p>
    </div>
  );
}

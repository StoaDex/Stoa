"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BaseError, erc20Abi, formatUnits, isAddress, parseAbiItem, parseEther, parseUnits, zeroAddress, type Address, type Hash } from "viem";
import { useAccount, usePublicClient, useReadContracts, useSwitchChain } from "wagmi";
import { useChainWrite } from "@/lib/chainWrite";
import { ROBINHOOD, addressUrlOn, txUrlOn } from "@/lib/networks";
import { CA as STOA } from "@/lib/stoaToken";
import { fmt } from "@/lib/swap";
import { getLogsOn } from "@/lib/logs";
import { BID_WINDOW, SLOTS, SPOT, SPOT_START, SPOTLIGHT_HIDDEN, epochAt, epochStart, left, spotlightAbi, utc, type SpotCandidate } from "@/lib/spotlight";
import { PageHead, Sk, TokenIcon } from "./ui";
import { useWalletModal } from "./Providers";
import { readEpoch, tokenMeta, useNow, useSpotLive, type SpotEpoch, type SpotTokenMeta } from "./spotlightData";
import SpotlightCalc from "./SpotlightCalc";

const net = ROBINHOOD;
const M = 10n ** 24n; // 1M $STOA
const eth = (v?: bigint, d = 4) => (v === undefined ? undefined : fmt(v, 18, d));
const stoaN = (v?: bigint) => (v === undefined ? undefined : Number(v / 10n ** 18n).toLocaleString("en-US"));
/** 1000000e18 → "1M", 2500000e18 → "2.5M" */
const mil = (v: bigint) => `${Number(v / 10n ** 21n) / 1000}M`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const errText = (e: unknown) => {
  const t = e instanceof BaseError ? `${e.shortMessage} ${e.details ?? ""}` : (e as Error).message ?? "";
  if (/insufficient funds/i.test(t)) return "Not enough ETH on Robinhood Chain to pay the gas. A few cents of ETH is enough.";
  if (/user rejected|denied/i.test(t)) return "Cancelled in your wallet.";
  return e instanceof BaseError ? e.shortMessage : t;
};

function Cell({ label, v, sub }: { label: string; v?: string; sub?: string }) {
  return (
    <div className="panel pad">
      <div className="lbl">{label}</div>
      <div style={{ fontFamily: "var(--num)", fontSize: 24, marginTop: 6 }}>{v ?? <Sk w={110} />}</div>
      {sub && <p className="note" style={{ marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

function TokenCell({ t, meta }: { t: Address; meta?: SpotTokenMeta }) {
  const sym = meta?.symbol ?? short(t);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <TokenIcon t={{ glyph: sym[0] ?? "?", tone: "other", logo: meta?.logo }} />
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <b style={{ fontWeight: 600 }}>{sym}</b>
        <a className="note" style={{ marginTop: 0, fontFamily: "var(--mono)" }} href={addressUrlOn(net, t)} target="_blank" rel="noopener noreferrer">{short(t)}</a>
      </span>
    </span>
  );
}

/** order a week's candidates the way `finalize` does: eligible first (not canceled, votes at the quorum), by bid, ties to
 *  the earlier entrant; the top `slots` would win if the week closed now */
function standing(ep: SpotEpoch) {
  const elig = ep.candidates.filter((c) => !c.canceled && c.votes > 0n && c.votes >= ep.params.quorum);
  const ranked = [...elig].sort((a, b) => (a.pot === b.pot ? a.index - b.index : a.pot > b.pot ? -1 : 1));
  const leading = new Set(ranked.slice(0, ep.params.slots).map((c) => c.token.toLowerCase()));
  const rest = ep.candidates.filter((c) => !leading.has(c.token.toLowerCase())).sort((a, b) => (a.pot === b.pot ? a.index - b.index : a.pot > b.pot ? -1 : 1));
  return { rows: [...ranked.slice(0, ep.params.slots), ...rest], leading };
}

type Pub = NonNullable<ReturnType<typeof usePublicClient>>;
/** ETH a wallet can claim now: every settled week, every token it voted for, the contract's own claimable() */
async function readClaims(pub: Pub, who: Address, e: number) {
  const eps = Array.from({ length: e }, (_, i) => i);
  const voted = await pub.multicall({ contracts: eps.map((x) => ({ address: SPOT!, abi: spotlightAbi, functionName: "votedTokens", args: [BigInt(x), who] })), allowFailure: false });
  const pairs = eps.flatMap((x, i) => (voted[i] as unknown as Address[]).map((t) => [x, t] as const));
  if (!pairs.length) return [];
  const amts = await pub.multicall({ contracts: pairs.map(([x, t]) => ({ address: SPOT!, abi: spotlightAbi, functionName: "claimable", args: [BigInt(x), t, who] })), allowFailure: false });
  return pairs.map(([x, t], i) => ({ epoch: x, token: t, amount: amts[i] as bigint })).filter((c) => c.amount > 0n);
}

/** One panel with where a connected voter stands: $STOA locked and unlocking, votes cast this week and what they
 *  would earn if voting closed now, ETH ready to claim, and the one next step that matters. Links down to the full
 *  lock, vote and claim panels. */
const V = { fontFamily: "var(--num)", fontSize: 17, overflowWrap: "anywhere" as const, lineHeight: 1.25 };
const U = { fontSize: 12, color: "var(--muted)" };
function MyDashboard({ ep, meta, mine, started, race }: { ep?: SpotEpoch; meta?: Record<string, SpotTokenMeta>; mine: Record<string, bigint>; started: boolean; race: number }) {
  const pub = usePublicClient({ chainId: net.chain.id });
  const { address } = useAccount();
  const me = address ?? zeroAddress;
  const r = useReadContracts({
    contracts: [
      { address: SPOT!, abi: spotlightAbi, functionName: "accounts", args: [me], chainId: net.chain.id },
      { address: SPOT!, abi: spotlightAbi, functionName: "availableVotes", args: [me], chainId: net.chain.id },
      { address: STOA, abi: erc20Abi, functionName: "balanceOf", args: [me], chainId: net.chain.id },
    ] as const,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const e = race; // weeks before this one are the ones that can be settled and claimed
  const claims = useQuery({ queryKey: ["spot-claims", address, e], enabled: !!pub && !!address && e >= 1, refetchInterval: 60_000, queryFn: () => readClaims(pub!, address!, e) });
  if (!address) return null;
  const acct = r.data?.[0]?.result as readonly [bigint, bigint, bigint] | undefined;
  const avail = r.data?.[1]?.result as bigint | undefined;
  const bal = r.data?.[2]?.result as bigint | undefined;
  const [active, pending, unlockAt] = acct ?? [0n, 0n, 0n];
  const now = Math.floor(Date.now() / 1000);
  const cast = Object.values(mine).reduce((a, v) => a + v, 0n);
  // what this week's votes earn if voting closed right now: only tokens that would win, pot after the burn cut,
  // split by votes (the contract's payout formula)
  const lead = ep ? standing(ep).leading : new Set<string>();
  const picks = ep ? Object.entries(mine).filter(([, v]) => v > 0n).map(([t, v]) => {
    const c = ep.candidates.find((x) => x.token.toLowerCase() === t);
    const win = !!c && lead.has(t);
    const est = c && win && c.votes > 0n ? ((c.pot - (c.pot * BigInt(ep.params.cutBps)) / 10_000n) * v) / c.votes : 0n;
    return { t, v, win, est, sym: meta?.[t]?.symbol ?? short(t) };
  }) : [];
  const estTotal = picks.reduce((a, p) => a + p.est, 0n);
  const claimTotal = (claims.data ?? []).reduce((a, c) => a + c.amount, 0n);
  const loading = r.isLoading;

  let next: { text: string; href: string; cta: string } | null = null;
  if (claimTotal > 0n) next = { text: `${eth(claimTotal)} ETH is ready to claim.`, href: "#claims", cta: "Claim" };
  else if (active === 0n && (bal ?? 0n) > 0n) next = { text: `You hold ${stoaN(bal)} $STOA that is not locked: locked $STOA is what votes.`, href: "#lock", cta: "Lock $STOA" };
  else if (active === 0n) next = { text: "This wallet has no $STOA yet: buy some, then lock it to vote.", href: `/trade?chain=robinhood&sell=ETH&buy=${STOA}`, cta: "Buy $STOA" };
  else if (started && (avail ?? 0n) > 0n) next = { text: `${stoaN(avail)} of your votes are not cast this week.`, href: "#race", cta: "Vote" };
  else if (!started) next = { text: `Your votes are ready. Voting opens ${utc(SPOT_START)}.`, href: "/docs/spotlight-voters", cta: "How voting works" };
  else if (pending > 0n && unlockAt > 0n && Number(unlockAt) <= now) next = { text: `${stoaN(pending)} $STOA has finished unlocking.`, href: "#lock", cta: "Withdraw" };

  return (
    <div className="panel pad" id="mine">
      <div className="rowx"><div className="lbl">YOUR SPOTLIGHT</div><span className="chip">{short(address)}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", marginTop: 10, gap: 10 }}>
        <div><div className="note" style={{ margin: 0 }}>Locked</div><div style={V}>{loading ? <Sk w={70} /> : <>{stoaN(active)} <small style={U}>$STOA</small></>}</div>
          {pending > 0n && <div className="note" style={{ margin: 0 }}>{stoaN(pending)} unlocking · {Number(unlockAt) <= now ? "ready" : `from ${utc(Number(unlockAt))}`}</div>}</div>
        <div><div className="note" style={{ margin: 0 }}>{started ? `Voted · week ${race + 1}` : "Votes ready"}</div><div style={V}>{loading ? <Sk w={70} /> : <>{stoaN(started ? cast : active)} <small style={U}>$STOA</small></>}</div>
          {started && avail !== undefined && avail > 0n && <div className="note" style={{ margin: 0 }}>{stoaN(avail)} not cast yet</div>}</div>
        <div><div className="note" style={{ margin: 0 }}>To claim</div><div style={V}>{e >= 1 && claims.isLoading ? <Sk w={60} /> : <>{e < 1 ? "0" : eth(claimTotal)} <small style={U}>ETH</small></>}</div>
          {e >= 1 && <div className="note" style={{ margin: 0 }}><Link href={`/spotlight/earned/${address}`}>All you have earned →</Link></div>}</div>
      </div>
      {started && picks.length > 0 && (
        <>
          <ul className="list" style={{ marginTop: 12 }}>
            {picks.map((p) => <li key={p.t}>{p.sym}: {stoaN(p.v)} $STOA · {p.win ? <b>winning now, ~{eth(p.est, 5)} ETH</b> : <span style={{ color: "var(--muted)" }}>not in the top {ep?.params.slots ?? SLOTS} right now</span>}</li>)}
          </ul>
          <p className="note" style={{ marginTop: 6 }}>If voting closed now: <b>~{eth(estTotal, 5)} ETH</b>. An estimate: bids and other votes move until the week ends.</p>
        </>
      )}
      {next && (
        <div className="notice" style={{ margin: "12px 0 0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 200px" }}>{next.text}</span>
          {next.href.startsWith("#") ? <a className="cta" href={next.href}>{next.cta}</a> : <Link className="cta" href={next.href}>{next.cta}</Link>}
        </div>
      )}
    </div>
  );
}

export default function SpotlightBody() {
  const pub = usePublicClient({ chainId: net.chain.id });
  const { address } = useAccount();
  const live = useSpotLive();
  const now = useNow(1_000);
  const ready = now > 0;
  const e = epochAt(now);
  const started = e >= 0;
  const race = Math.max(0, e); // the week bids and votes go to (week 0 before the start)
  const raceStart = epochStart(race), bidsClose = raceStart + BID_WINDOW, raceEnd = raceStart + 7 * 86400;

  const data = useQuery({
    queryKey: ["spot-market", race, address],
    enabled: !!pub && live,
    refetchInterval: 20_000,
    queryFn: async () => {
      const [cur, prev] = await Promise.all([readEpoch(pub!, race), e >= 1 ? readEpoch(pub!, e - 1) : Promise.resolve(null)]);
      const totals = await pub!.multicall({
        contracts: [
          { address: SPOT!, abi: spotlightAbi, functionName: "totalPaidToVoters" },
          { address: SPOT!, abi: spotlightAbi, functionName: "totalBurned" },
          { address: SPOT!, abi: spotlightAbi, functionName: "burnPot" },
          { address: SPOT!, abi: spotlightAbi, functionName: "totalLocked" },
          { address: SPOT!, abi: spotlightAbi, functionName: "entryFeeFor", args: [BigInt(race)] },
          { address: SPOT!, abi: spotlightAbi, functionName: "paused" },
        ],
        allowFailure: false,
      });
      const tokens = [...new Set([...cur.candidates.map((c) => c.token), ...(prev?.winners ?? [])])];
      const meta = await tokenMeta(pub!, tokens);
      let mine: Record<string, bigint> = {};
      if (address && started) {
        const ts = (await pub!.readContract({ address: SPOT!, abi: spotlightAbi, functionName: "votedTokens", args: [BigInt(race), address] })) as Address[];
        const vs = ts.length ? await pub!.multicall({ contracts: ts.map((t) => ({ address: SPOT!, abi: spotlightAbi, functionName: "votesOf", args: [BigInt(race), t, address] })), allowFailure: false }) : [];
        mine = Object.fromEntries(ts.map((t, i) => [t.toLowerCase(), vs[i] as bigint]));
      }
      const [paid, burned, pot, locked, entryFee, paused] = totals as [bigint, bigint, bigint, bigint, bigint, boolean];
      return { cur, prev, meta, mine, paid, burned, pot, locked, entryFee, paused };
    },
  });
  const d = data.data;
  const phase = !started ? "before" : now < bidsClose ? "bids" : "votes";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHead eyebrow="SPOTLIGHT · ROBINHOOD CHAIN" title="Projects pay ETH. $STOA holders earn it." action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="cta" href="/spotlight/projects">For projects</Link><Link className="ghost" href="/docs/spotlight">How it works</Link><a className="ghost" href="/cal/spotlight.ics">Add weekly reminders</a></div>}>
        Every week projects bid ETH for three sponsored slots on Stoa. $STOA holders lock and vote. The three largest bids that reach the vote quorum win, and 90% of their ETH goes to the holders who voted for them. The other 10% buys $STOA and burns it.
      </PageHead>

      {ready && (!live || !started) && (
        <div className="notice" style={{ marginBottom: 0 }}>
          Week 1 opens <b>{utc(SPOT_START)}</b>{now < SPOT_START ? ` (in ${left(SPOT_START - now)})` : ""}.{" "}
          {live ? "You can lock $STOA now, so your votes are ready when it opens." : "The contract goes live before then; this page switches on by itself."}
        </div>
      )}
      {d?.paused && <div className="notice" style={{ marginBottom: 0 }}>Spotlight is paused: no new bids, locks or votes. Claims, refunds and withdrawals still work, and you can take all your $STOA out at once below.</div>}

      <div className="grid3 sgrid">
        <Cell
          label={!ready ? "THIS WEEK" : started ? `WEEK ${race + 1} · ${phase === "bids" ? "BIDS OPEN" : "VOTES ONLY"}` : "WEEK 1"}
          v={!ready ? undefined : !started ? left(SPOT_START - now) : phase === "bids" ? left(bidsClose - now) : left(raceEnd - now)}
          sub={!ready ? undefined : !started ? `until ${utc(SPOT_START)}` : phase === "bids" ? `bids close ${utc(bidsClose)}` : `votes close ${utc(raceEnd)}`}
        />
        <Cell label="ETH PAID TO HOLDERS" v={live ? (d ? `${eth(d.paid)} ETH` : undefined) : "0 ETH"} sub="All weeks, set aside for voters to claim" />
        <Cell label="$STOA BURNED BY SPOTLIGHT" v={live ? (d ? stoaN(d.burned) : undefined) : "0"} sub={d && d.pot > 0n ? `${eth(d.pot)} ETH waiting to buy and burn` : "10% of winning bids plus entry fees"} />
      </div>

      {live && ready && <MyDashboard ep={d?.cur} meta={d?.meta} mine={d?.mine ?? {}} started={started} race={race} />}
      {live && ready && <LockCounter quorum={d?.cur.params.quorum} started={started} race={race} />}
      {ready && <SpotlightCalc cur={d?.cur} meta={d?.meta} week={race + 1} />}
      {ready && <ThisWeek prev={d?.prev ?? null} meta={d?.meta} e={e} onSettled={() => void data.refetch()} />}
      {live && started && d && <Race ep={d.cur} meta={d.meta} mine={d.mine} phase={phase} onDone={() => void data.refetch()} />}
      {live && ready && <HolderPanel race={race} started={started} paused={!!d?.paused} onDone={() => void data.refetch()} />}
      {live && <Claims e={e} />}
      {live && ready && <ProjectPanel race={race} phase={phase} entryFee={d?.entryFee} minBid={d?.cur.params.minBid} maxBid={d?.cur.params.maxBid} cur={d?.cur} onDone={() => void data.refetch()} />}

      <div className="panel pad">
        <div className="lbl">THE RULES</div>
        <ul className="list">
          <li>Slots per week <b>{SLOTS}</b></li>
          <li>Bids <b>Mon 00:00 to Sat 00:00 UTC</b></li>
          <li>Votes <b>Until Mon 00:00 UTC</b></li>
          <li>Winners <b>Largest bids with at least 1M $STOA of votes</b></li>
          <li>To voters <b>90% of the winning bid, pro rata</b></li>
          <li>To burn <b>10% of winning bids + entry fees</b></li>
          <li>Losing bids <b>Refunded in full (entry fee is not)</b></li>
          <li>Unlocking <b>At the end of the week; $STOA that voted waits one more week</b></li>
        </ul>
        <p className="note">
          Slots are sponsored. Projects are not reviewed by Stoa, and a winning token can still go to zero. Payouts depend on what projects bid: nothing is promised. The contract is source-verified, not externally audited. <Link href="/docs/spotlight">Full rules and risks</Link>
          {SPOT && <> · <a href={addressUrlOn(net, SPOT)} target="_blank" rel="noopener noreferrer">Contract</a></>}
        </p>
      </div>
    </div>
  );
}

/** How much $STOA is locked and can vote, against what the slots need: each winning token needs `quorum` votes, so
 *  SLOTS × quorum of voting $STOA is enough to fill every slot. Counted from Locked events and each holder's active
 *  balance (pending unlocks don't vote). */
function LockCounter({ quorum, started, race }: { quorum?: bigint; started: boolean; race: number }) {
  const pub = usePublicClient({ chainId: net.chain.id });
  const q = useQuery({
    queryKey: ["spot-lockers"],
    enabled: !!pub,
    refetchInterval: 60_000,
    queryFn: async () => {
      const lockedEv = parseAbiItem("event Locked(address indexed holder, uint256 amount)");
      const logs = (await getLogsOn(net, { address: SPOT!, event: lockedEv, fromBlock: net.deployBlock })) as unknown as { args: { holder: Address } }[];
      const holders = [...new Set(logs.map((l) => l.args.holder.toLowerCase()))] as Address[];
      if (!holders.length) return { voting: 0n, holders: 0 };
      const accts = await pub!.multicall({ contracts: holders.map((h) => ({ address: SPOT!, abi: spotlightAbi, functionName: "accounts", args: [h] })), allowFailure: false });
      let voting = 0n, n = 0;
      for (const a of accts as unknown as (readonly [bigint, bigint, bigint])[]) { if (a[0] > 0n) { voting += a[0]; n++; } }
      return { voting, holders: n };
    },
  });
  // the server's figure (edge-cached) shows at once and stands in if the browser's own log read is slow or refused
  const api = useQuery({
    queryKey: ["spot-api-locked"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const j = (await (await fetch("/api/v1/spotlight")).json()) as { stoaLocked?: number };
      return typeof j.stoaLocked === "number" ? parseUnits(j.stoaLocked.toFixed(6), 18) : undefined;
    },
  });
  const need = quorum ?? M;
  const full = need * BigInt(SLOTS);
  const v = q.data?.voting ?? api.data;
  const slots = v === undefined ? 0 : Math.min(SLOTS, Number(v / need));
  const pct = v === undefined ? 0 : Math.min(100, Number((v * 1000n) / full) / 10);
  const toNext = v === undefined || slots >= SLOTS ? 0n : need * BigInt(slots + 1) - v;
  return (
    <div className="panel pad">
      <div className="rowx">
        <div className="lbl">{started ? `VOTES READY · WEEK ${race + 1}` : "VOTES READY FOR WEEK 1"}</div>
        <span className="chip">{q.data ? `${q.data.holders} ${q.data.holders === 1 ? "holder" : "holders"} locked` : "…"}</span>
      </div>
      <div style={{ fontFamily: "var(--num)", fontSize: 24, marginTop: 6 }}>
        {v === undefined ? <Sk w={160} /> : <>{stoaN(v)} <small style={{ fontSize: 14, color: "var(--muted)" }}>/ {stoaN(full)} $STOA</small></>}
      </div>
      <div role="progressbar" aria-label="Locked $STOA toward filling all slots" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
        style={{ position: "relative", height: 10, borderRadius: 10, background: "rgba(47,111,214,.12)", marginTop: 12, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 10, background: "var(--accent)", transition: "width .6s ease" }} />
        {Array.from({ length: SLOTS - 1 }, (_, i) => (
          <span key={i} style={{ position: "absolute", top: 0, bottom: 0, left: `${((i + 1) * 100) / SLOTS}%`, width: 2, background: "#fff" }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${SLOTS},1fr)`, marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
        {Array.from({ length: SLOTS }, (_, i) => (
          <span key={i} style={{ textAlign: "right", color: slots > i ? "var(--accent-d)" : undefined, fontWeight: slots > i ? 600 : undefined }}>
            {mil(need * BigInt(i + 1))} · {i + 1} {i === 0 ? "slot" : "slots"}{slots > i ? " ✓" : ""}
          </span>
        ))}
      </div>
      <p className="note" style={{ marginTop: 10 }}>
        Each winning token needs {stoaN(need)} $STOA of votes. {v === undefined ? <span style={{ visibility: "hidden" }}>0.00M more locked $STOA lets the first slot be won.</span> : slots >= SLOTS
          ? "Enough $STOA is locked to fill all three slots."
          : `${stoaN(toNext)} more locked $STOA ${slots === 0 ? "lets the first slot be won" : `opens slot ${slots + 1}`}.`}{" "}
        Holders split their votes across tokens, so this is the most that can win, not a promise. Without votes, bids are refunded and nobody earns.
      </p>
      {slots < SLOTS && <a className="cta" href="#lock" style={{ marginTop: 12 }}>Lock $STOA</a>}
    </div>
  );
}

function ThisWeek({ prev, meta, e, onSettled }: { prev: SpotEpoch | null; meta?: Record<string, SpotTokenMeta>; e: number; onSettled: () => void }) {
  const pub = usePublicClient({ chainId: net.chain.id });
  const { isConnected } = useAccount();
  const { open } = useWalletModal();
  const { writeContractAsync } = useChainWrite();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const winners = (prev?.winners ?? []).filter((w) => !SPOTLIGHT_HIDDEN.includes(w.toLowerCase()));
  async function settle() {
    if (!pub || !prev) return;
    setBusy(true); setErr(null);
    try {
      const hash = await writeContractAsync({ address: SPOT!, abi: spotlightAbi, functionName: "finalize", args: [BigInt(prev.epoch)], chainId: net.chain.id });
      await pub.waitForTransactionReceipt({ hash });
      onSettled();
    } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
  }
  return (
    <div className="panel pad">
      <div className="rowx"><div className="lbl">THIS WEEK&apos;S SPOTLIGHT</div><span className="chip">Sponsored · chosen by $STOA holders</span></div>
      {e < 1 && <p style={{ marginTop: 10 }}>The first winners show here, and on Trade, Launches and Tokens, from {utc(epochStart(1))}.</p>}
      {e >= 1 && prev && !prev.finalized && (
        <div style={{ marginTop: 10 }}>
          <p>Week {prev.epoch + 1} has closed and is waiting to be settled. Anyone can settle it: it picks the winners and makes their ETH claimable. It only costs gas.</p>
          {isConnected ? <button className="ghost" type="button" disabled={busy} onClick={settle}>{busy ? "Settling…" : `Settle week ${prev.epoch + 1}`}</button> : <button className="ghost" type="button" onClick={open}>Connect wallet to settle</button>}
          {err && <div className="err" style={{ marginTop: 10 }}>{err}</div>}
        </div>
      )}
      {e >= 1 && prev?.finalized && winners.length === 0 && <p style={{ marginTop: 10 }}>No token won week {prev.epoch + 1}: none reached the vote quorum. Every bid was refunded.</p>}
      {winners.length > 0 && (
        <div className="grid3" style={{ marginTop: 14 }}>
          {winners.map((w) => {
            const c = prev!.candidates.find((x) => x.token.toLowerCase() === w.toLowerCase());
            return (
              <div key={w} className="panel pad" style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
                <TokenCell t={w} meta={meta?.[w.toLowerCase()]} />
                <ul className="list">
                  <li>Paid to voters <b>{eth(c?.payout)} ETH</b></li>
                  <li>Votes <b>{stoaN(c?.votes)} STOA</b></li>
                </ul>
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <Link className="cta" href={`/trade?chain=robinhood&buy=${w}`}>Trade</Link>
                  <Link className="ghost" href={`/tokens/robinhood/${w}`}>Token page</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Race({ ep, meta, mine, phase, onDone }: { ep: SpotEpoch; meta: Record<string, SpotTokenMeta>; mine: Record<string, bigint>; phase: string; onDone: () => void }) {
  const pub = usePublicClient({ chainId: net.chain.id });
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useChainWrite();
  const { rows, leading } = useMemo(() => standing(ep), [ep]);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: Hash } | null>(null);
  useEffect(() => {
    setEdit(Object.fromEntries(Object.entries(mine).map(([k, v]) => [k, (v / 10n ** 18n).toString()])));
  }, [mine]);
  const parse = (s?: string) => { try { return s ? parseUnits(s, 18) : 0n; } catch { return 0n; } };
  const total = Object.values(edit).reduce((a, s) => a + parse(s), 0n);
  const perM = (c: SpotCandidate) => (c.votes > 0n ? (c.pot * BigInt(10_000 - ep.params.cutBps) / 10_000n) * M / c.votes : undefined);

  async function save() {
    if (!pub) return;
    const ts = Object.entries(edit).filter(([, s]) => parse(s) > 0n);
    setBusy(true); setMsg(null);
    try {
      const hash = await writeContractAsync({
        address: SPOT!, abi: spotlightAbi, functionName: "vote",
        args: [ts.map(([t]) => t as Address), ts.map(([, s]) => parse(s))], chainId: net.chain.id,
      });
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("Transaction reverted");
      setMsg({ ok: true, text: "Votes saved", hash }); onDone();
    } catch (x) { setMsg({ ok: false, text: errText(x) }); } finally { setBusy(false); }
  }

  return (
    <div className="panel" id="race" style={{ overflow: "hidden" }}>
      <div className="pad rowx" style={{ paddingBottom: 0 }}>
        <div className="lbl">THE RACE · WEEK {ep.epoch + 1}</div>
        <span className="chip">{phase === "bids" ? "Bids and votes open" : "Votes only: bids are final"}</span>
      </div>
      {rows.length === 0 ? (
        <p className="pad" style={{ paddingTop: 10 }}>No bids yet this week. The first project to bid pays the base entry fee.</p>
      ) : (
        <table className="tbl" style={{ marginTop: 8 }}>
          <thead><tr><th>TOKEN</th><th>BID</th><th className="hm">VOTES</th><th className="hm">ETH PER 1M VOTES</th><th>STATUS</th>{isConnected && <th>YOUR VOTES</th>}</tr></thead>
          <tbody>
            {rows.map((c) => {
              const k = c.token.toLowerCase();
              const status = c.canceled ? "Canceled" : leading.has(k) ? "Winning now" : c.votes < ep.params.quorum ? `Needs ${stoaN(ep.params.quorum - c.votes)} votes` : "Outbid";
              return (
                <tr key={c.token} style={c.canceled ? { opacity: 0.5 } : undefined}>
                  <td><TokenCell t={c.token} meta={meta[k]} /></td>
                  <td style={{ fontFamily: "var(--num)" }}>{eth(c.pot)} ETH</td>
                  <td className="hm" style={{ fontFamily: "var(--num)" }}>{stoaN(c.votes)}</td>
                  <td className="hm" style={{ fontFamily: "var(--num)" }}>{perM(c) === undefined ? "—" : `${eth(perM(c), 5)} ETH`}</td>
                  <td><span className="chip" style={leading.has(k) ? undefined : { background: "#F2F4F7", color: "var(--muted)" }}>{status}</span>{!c.canceled && <Link className="note" style={{ display: "block", marginTop: 4 }} href={`/spotlight/vote/${k}`}>Share</Link>}</td>
                  {isConnected && <td>{c.canceled ? "—" : <input className="inp" style={{ margin: 0, width: 130 }} inputMode="numeric" placeholder="0" value={edit[k] ?? ""} onChange={(x) => setEdit({ ...edit, [k]: x.target.value.replace(/[^0-9]/g, "") })} aria-label={`Your votes for ${meta[k]?.symbol ?? c.token}`} />}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {isConnected && address && rows.length > 0 && (
        <div className="pad" style={{ paddingTop: 12 }}>
          <button className="cta" type="button" disabled={busy} onClick={save}>{busy ? "Saving votes…" : `Save votes (${stoaN(total)} $STOA)`}</button>
          <p className="note">Votes replace your earlier votes this week and can be changed until it closes. $STOA that votes this week can be unlocked from next week. ETH per 1M votes is what a winning token pays its voters at today&apos;s votes; it falls as more holders vote for it.</p>
          {msg && <div className={msg.ok ? "ok" : "err"} style={{ marginTop: 10 }}>{msg.text}{msg.hash && <> · <a href={txUrlOn(net, msg.hash)} target="_blank" rel="noopener noreferrer">View</a></>}</div>}
        </div>
      )}
    </div>
  );
}

function useSend(onDone: () => void) {
  const pub = usePublicClient({ chainId: net.chain.id });
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: Hash } | null>(null);
  async function send(label: string, fn: () => Promise<Hash>) {
    if (!pub) return;
    setBusy(label); setMsg(null);
    try {
      // the wallet may still be on Elysium (the default network): move it to Robinhood Chain first
      if (chainId !== net.chain.id) await switchChainAsync({ chainId: net.chain.id });
      const hash = await fn();
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("Transaction reverted");
      setMsg({ ok: true, text: `${label}: confirmed`, hash }); onDone();
      return true;
    } catch (x) { setMsg({ ok: false, text: errText(x) }); return false; } finally { setBusy(null); }
  }
  const note = msg && <div className={msg.ok ? "ok" : "err"} style={{ marginTop: 10 }}>{msg.text}{msg.hash && <> · <a href={txUrlOn(net, msg.hash)} target="_blank" rel="noopener noreferrer">View</a></>}</div>;
  return { busy, send, note };
}

function HolderPanel({ race, started, paused, onDone }: { race: number; started: boolean; paused: boolean; onDone: () => void }) {
  const { address, isConnected } = useAccount();
  const { open } = useWalletModal();
  const { writeContractAsync } = useChainWrite();
  const me = address ?? zeroAddress;
  const r = useReadContracts({
    contracts: [
      { address: STOA, abi: erc20Abi, functionName: "balanceOf", args: [me], chainId: net.chain.id },
      { address: STOA, abi: erc20Abi, functionName: "allowance", args: [me, SPOT!], chainId: net.chain.id },
      { address: SPOT!, abi: spotlightAbi, functionName: "accounts", args: [me], chainId: net.chain.id },
      { address: SPOT!, abi: spotlightAbi, functionName: "availableVotes", args: [me], chainId: net.chain.id },
    ] as const,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const done = () => { void r.refetch(); onDone(); };
  const { busy, send, note } = useSend(done);
  const [amt, setAmt] = useState("");
  const bal = r.data?.[0]?.result as bigint | undefined, allow = r.data?.[1]?.result as bigint | undefined;
  const acct = r.data?.[2]?.result as readonly [bigint, bigint, bigint] | undefined;
  const avail = r.data?.[3]?.result as bigint | undefined;
  const [active, pending, unlockAt] = acct ?? [0n, 0n, 0n];
  let raw: bigint | undefined;
  try { raw = amt ? parseUnits(amt, 18) : undefined; } catch { raw = undefined; }
  const now = BigInt(Math.floor(Date.now() / 1000));
  const w = (fn: "lock" | "requestUnlock", a: bigint) => writeContractAsync({ address: SPOT!, abi: spotlightAbi, functionName: fn, args: [a], chainId: net.chain.id });
  const btn = (label: string, on: () => void, disabled: boolean) => (
    <button className="ghost" type="button" disabled={!!busy || disabled} onClick={on} style={{ marginRight: 8, marginTop: 8 }}>{busy === label ? `${label}…` : label}</button>
  );
  if (!isConnected) return <div className="panel pad" id="lock"><div className="lbl">YOUR $STOA</div><p className="note">Connect a wallet on Robinhood Chain to lock $STOA, vote and claim ETH.</p><button className="cta" type="button" onClick={open}>Connect wallet</button></div>;
  return (
    <div className="panel pad" id="lock">
      <div className="lbl">YOUR $STOA</div>
      <ul className="list">
        <li>In your wallet <b>{stoaN(bal) ?? "—"} STOA</b></li>
        <li>Locked, voting <b>{stoaN(active)} STOA</b></li>
        <li>Free to vote or unlock this week <b>{stoaN(avail)} STOA</b></li>
        <li>Unlocking <b>{stoaN(pending)} STOA{pending > 0n ? ` · ${unlockAt <= now ? "ready to withdraw" : `from ${utc(Number(unlockAt))}`}` : ""}</b></li>
      </ul>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input className="inp" style={{ flex: 1, minWidth: 0, marginTop: 0 }} inputMode="decimal" placeholder="Amount of $STOA" aria-label="Amount of $STOA" value={amt} onChange={(x) => setAmt(x.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, ""))} />
        <button className="ghost" type="button" disabled={!bal} onClick={() => setAmt(formatUnits(bal ?? 0n, 18))}>Max</button>
      </div>
      {raw !== undefined && raw > (bal ?? 0n) && <p className="note" style={{ marginTop: 6 }}>More than you hold. Use Max for your whole wallet balance.</p>}
      {(() => {
        const needApprove = raw !== undefined && raw > 0n && (allow ?? 0n) < raw;
        const label = needApprove ? "1 · Approve $STOA" : "Lock $STOA";
        return (
          <button className="cta" type="button" style={{ marginTop: 10, width: "100%" }}
            disabled={!!busy || paused || !raw || raw > (bal ?? 0n)}
            onClick={() => needApprove
              ? send(label, () => writeContractAsync({ address: STOA, abi: erc20Abi, functionName: "approve", args: [SPOT!, raw!], chainId: net.chain.id }))
              : void send(label, () => w("lock", raw!)).then((ok) => { if (ok) setAmt(""); })}>
            {busy === label ? `${label}…` : label}
          </button>
        );
      })()}
      {raw !== undefined && raw > 0n && (allow ?? 0n) < raw && <p className="note" style={{ marginTop: 6 }}>Two steps: approve this exact amount, then lock it. Both run on Robinhood Chain.</p>}
      {active + pending > 0n && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <div className="lbl">UNLOCK</div>
          <p className="note" style={{ marginTop: 4 }}>Request unlock uses the amount above (up to {stoaN(avail)} STOA now).</p>
          {btn("Request unlock", () => send("Request unlock", () => w("requestUnlock", raw!)), !raw || raw > (avail ?? 0n))}
          {btn("Withdraw", () => send("Withdraw", () => writeContractAsync({ address: SPOT!, abi: spotlightAbi, functionName: "withdraw", args: [address!], chainId: net.chain.id })), pending === 0n || unlockAt > now)}
        </div>
      )}
      {paused && btn("Withdraw everything now", () => send("Withdraw everything now", () => writeContractAsync({ address: SPOT!, abi: spotlightAbi, functionName: "emergencyWithdraw", args: [address!], chainId: net.chain.id })), active + pending === 0n)}
      {note}
      <p className="note">
        {started
          ? `Unlocked $STOA can be withdrawn when week ${race + 1} ends (${utc(epochStart(race + 1))}). $STOA that voted this week can be unlocked from next week.`
          : `Locked $STOA can vote from ${utc(SPOT_START)}. Unlocking before then is ready at that time.`}{" "}
        Locking earns nothing by itself: you earn when a token you voted for wins. Team and dev wallets do not lock or vote.
      </p>
    </div>
  );
}

/** ETH you can claim for past weeks you voted in */
function Claims({ e }: { e: number }) {
  const pub = usePublicClient({ chainId: net.chain.id });
  const { address } = useAccount();
  const { writeContractAsync } = useChainWrite();
  const q = useQuery({
    queryKey: ["spot-claims", address, e],
    enabled: !!pub && !!address && e >= 1,
    refetchInterval: 60_000,
    queryFn: () => readClaims(pub!, address!, e),
  });
  const { busy, send, note } = useSend(() => { void q.refetch(); void earned.refetch(); });
  // everything this wallet has earned (claimed or not), for the share card
  const earned = useQuery({
    queryKey: ["spot-earned", address, e],
    enabled: !!address && e >= 1,
    refetchInterval: 120_000,
    queryFn: async () => ((await (await fetch(`/api/spotlight/earned?address=${address}`)).json()) as { eth?: number }).eth ?? 0,
  });
  const list = q.data ?? [];
  if (!address || e < 1) return null;
  const won = earned.data ?? 0;
  const shareUrl = `https://stoadex.com/spotlight/earned/${address}`;
  const shareText = `I've earned ${won.toLocaleString("en-US", { maximumFractionDigits: won < 1 ? 4 : 3 })} ETH voting with $STOA in @StoaDEX Spotlight. Projects pay ETH, holders earn it.`;
  const total = list.reduce((a, c) => a + c.amount, 0n);
  return (
    <div className="panel pad" id="claims">
      <div className="rowx"><div className="lbl">YOUR ETH TO CLAIM</div><span className="chip">{q.isLoading ? "…" : `${eth(total)} ETH`}</span></div>
      {list.length === 0
        ? <p className="note">Nothing to claim yet. When a token you voted for wins, its ETH shows here after the week is settled.</p>
        : <>
            <ul className="list">{list.map((c) => <li key={`${c.epoch}-${c.token}`}>Week {c.epoch + 1} · {short(c.token)} <b>{eth(c.amount, 6)} ETH</b></li>)}</ul>
            <button className="cta" type="button" style={{ marginTop: 12 }} disabled={!!busy} onClick={() => send("Claim", () => writeContractAsync({
              address: SPOT!, abi: spotlightAbi, functionName: "claimMany",
              args: [list.map((c) => BigInt(c.epoch)), list.map((c) => c.token), address], chainId: net.chain.id,
            }))}>{busy ? "Claiming…" : `Claim ${eth(total)} ETH`}</button>
          </>}
      {won > 0 && (
        <p className="note" style={{ marginTop: 12, marginBottom: 0 }}>
          You have earned <b>{won.toLocaleString("en-US", { maximumFractionDigits: won < 1 ? 5 : 3 })} ETH</b> in Spotlight so far.{" "}
          <a href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer">Share it on X ↗</a>
          {" · "}<Link href={`/spotlight/earned/${address}`}>Your card</Link>
        </p>
      )}
      {note}
    </div>
  );
}

function ProjectPanel({ race, phase, entryFee, minBid, maxBid, cur, onDone }: { race: number; phase: string; entryFee?: bigint; minBid?: bigint; maxBid?: bigint; cur?: SpotEpoch; onDone: () => void }) {
  const pub = usePublicClient({ chainId: net.chain.id });
  const { address, isConnected } = useAccount();
  const { open } = useWalletModal();
  const { writeContractAsync } = useChainWrite();
  const [token, setToken] = useState("");
  const [amt, setAmt] = useState("");
  const refunds = useQuery({
    queryKey: ["spot-refunds", address, race],
    enabled: !!pub && !!address,
    refetchInterval: 60_000,
    queryFn: async () => {
      const ev = spotlightAbi.find((x) => x.type === "event" && x.name === "Bid") as never;
      const logs = (await getLogsOn(net, { address: SPOT!, event: ev, args: { bidder: address }, fromBlock: net.deployBlock })) as unknown as { args: { epoch: bigint; token: Address } }[];
      const pairs = [...new Map(logs.map((l) => [`${l.args.epoch}-${l.args.token}`, [l.args.epoch, l.args.token] as const])).values()];
      if (!pairs.length) return [];
      const amts = await pub!.multicall({ contracts: pairs.map(([x, t]) => ({ address: SPOT!, abi: spotlightAbi, functionName: "refundable", args: [x, t, address!] })), allowFailure: false });
      return pairs.map(([x, t], i) => ({ epoch: Number(x), token: t, amount: amts[i] as bigint })).filter((r) => r.amount > 0n);
    },
  });
  const { busy, send, note } = useSend(() => { void refunds.refetch(); onDone(); });
  const valid = isAddress(token);
  const isNew = valid && !cur?.candidates.some((c) => c.token.toLowerCase() === token.toLowerCase());
  const isStoa = valid && token.toLowerCase() === STOA.toLowerCase();
  let value: bigint | undefined;
  try { value = amt ? parseEther(amt) : undefined; } catch { value = undefined; }
  const fee = isNew ? entryFee ?? 0n : 0n;
  const tooSmall = isNew && value !== undefined && minBid !== undefined && value < minBid;
  const pot = cur?.candidates.find((c) => c.token.toLowerCase() === token.toLowerCase())?.pot ?? 0n;
  const tooBig = value !== undefined && maxBid !== undefined && pot + value > maxBid;
  const closed = phase !== "bids";
  return (
    <div className="panel pad" id="bid">
      <div className="rowx"><div className="lbl">FOR PROJECTS · BID FOR A SLOT</div><span className="chip">{closed ? (phase === "before" ? "Opens with week 1" : "Bids open again Monday") : "Open"}</span></div>
      <p style={{ marginTop: 10 }}>
        Bid ETH for your token&apos;s place in next week&apos;s Spotlight: the top of Trade&apos;s token list, Launches and Tokens, for a week. If you win, 90% of your bid goes to the $STOA holders who voted for you and 10% is burned. If you lose, take your bid back in full.
      </p>
      <ul className="list">
        <li>Entry fee, once per token per week <b>{eth(entryFee, 4) ?? "…"} ETH now · grows every 20 tokens · not refunded</b></li>
        <li>Minimum first bid <b>{eth(minBid, 4) ?? "0.01"} ETH</b></li>
        <li>Most a token can have this week <b>{eth(maxBid, 2) ?? "0.5"} ETH (beta cap)</b></li>
      </ul>
      {!isConnected ? (
        <button className="cta" type="button" style={{ marginTop: 12 }} onClick={open}>Connect wallet to bid</button>
      ) : (
        <>
          <input className="inp" placeholder="Token address (0x…)" value={token} onChange={(x) => setToken(x.target.value.trim())} />
          <input className="inp" inputMode="decimal" placeholder={`Bid in ETH${isNew && minBid ? ` (at least ${eth(minBid, 4)})` : ""}`} value={amt} onChange={(x) => setAmt(x.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, ""))} />
          {valid && !isNew && <p className="note" style={{ marginTop: 8 }}>This token is in this week&apos;s race. Share its page so your community can lock $STOA and vote for it: <Link href={`/spotlight/vote/${token.toLowerCase()}`}>stoadex.com/spotlight/vote/…</Link></p>}
          {isStoa && <p className="err" style={{ marginTop: 8 }}>$STOA itself cannot bid.</p>}
          {tooSmall && <p className="err" style={{ marginTop: 8 }}>A token&apos;s first bid must be at least {eth(minBid, 4)} ETH.</p>}
          {tooBig && <p className="err" style={{ marginTop: 8 }}>That passes this week&apos;s cap of {eth(maxBid, 2)} ETH for one token.</p>}
          <button className="cta" type="button" style={{ marginTop: 12 }}
            disabled={!!busy || closed || !valid || isStoa || !value || tooSmall || tooBig}
            onClick={() => send("Bid", () => writeContractAsync({ address: SPOT!, abi: spotlightAbi, functionName: "bid", args: [token as Address], value: value! + fee, chainId: net.chain.id }))}>
            {busy === "Bid" ? "Bidding…" : value ? `Bid ${eth(value, 4)} ETH${fee > 0n ? ` + ${eth(fee, 4)} ETH entry fee` : ""}` : "Bid"}
          </button>
          {(refunds.data?.length ?? 0) > 0 && (
            <>
              <div className="lbl" style={{ marginTop: 18 }}>YOUR REFUNDS</div>
              <ul className="list">{refunds.data!.map((x) => (
                <li key={`${x.epoch}-${x.token}`}>Week {x.epoch + 1} · {short(x.token)} <b><button className="ghost" type="button" disabled={!!busy} onClick={() => send("Refund", () => writeContractAsync({ address: SPOT!, abi: spotlightAbi, functionName: "refund", args: [BigInt(x.epoch), x.token, address!], chainId: net.chain.id }))}>Refund {eth(x.amount)} ETH</button></b></li>
              ))}</ul>
            </>
          )}
          {note}
        </>
      )}
      <p className="note">
        Anyone can add to a token&apos;s bid, and each contributor can take theirs back if it does not win. A token needs at least 1M $STOA of votes to win, so tell your community. The guardian cancels scams and honeypots until Saturday; a canceled bid is refunded in full. See <Link href="/docs/spotlight">the rules</Link>.
      </p>
    </div>
  );
}


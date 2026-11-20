"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { useChainWrite } from "@/lib/chainWrite";
import { BaseError, zeroAddress, type Address, type Hash } from "viem";
import { PageHead, Sk } from "./ui";
import { useNet, useWalletModal } from "./Providers";
import { ROBINHOOD, addressUrlOn, txUrlOn } from "@/lib/networks";
import { PONS_HOOK, USDG, type LaunchInfo } from "@/lib/ponsLaunch";
import { findV4Pools, sameKey, type PoolKey } from "@/lib/v4";
import { v4AdapterAbi } from "@/lib/abi";
import { CA } from "@/lib/stoaAddress";
import { SITE } from "@/lib/chain";
import { routerAbi } from "@/lib/abi";
import { shareOrCopy, useRefFromUrl } from "@/lib/share";
import CoverPanel, { CoverChip } from "./CoverPanel";
import SafetyPanel from "./SafetyPanel";
import CmcPanel from "./CmcPanel";
import TokenShare from "./TokenShare";

const PONS = (a: string) => `https://ponsfamily.com/launchpad/${a}`;
const usd = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);
const px = (v: number | null) => (v === null ? "—" : v >= 0.01 ? `$${v.toFixed(4)}` : `$${v.toPrecision(3)}`);
function age(ts: number) {
  const s = Math.max(0, Date.now() / 1000 - ts);
  const n = (v: number, unit: string) => `${v} ${unit}${v === 1 ? "" : "s"}`;
  return s < 3600 ? n(Math.max(1, Math.round(s / 60)), "minute") : s < 86400 ? n(Math.round(s / 3600), "hour") : n(Math.round(s / 86400), "day");
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

/** One Pons launch: curve progress, price and market cap from /api/pons/token (refreshed every 10 seconds), with
 *  Trade on Stoa when the router routes it and a share link that carries the sharer's referral. */
export default function LaunchToken({ token }: { token: Address }) {
  const net = useNet();
  const { address } = useAccount();
  const [copied, setCopied] = useState(false);
  useRefFromUrl();
  const q = useQuery({
    queryKey: ["pons-token", token],
    refetchInterval: 10_000,
    queryFn: async () => {
      const r = await fetch(`/api/pons/token/${token}`);
      const d = (await r.json()) as LaunchInfo & { error?: string };
      if (!r.ok) throw new Error(d.error ?? "unavailable");
      return d;
    },
  });
  const l = q.data;
  const ponsLive = useReadContract({
    address: ROBINHOOD.contracts.router, abi: routerAbi, functionName: "isAdapter", args: [ROBINHOOD.pons ?? zeroAddress],
    chainId: ROBINHOOD.chain.id, query: { enabled: !!ROBINHOOD.pons, refetchInterval: 60_000 },
  }).data === true;
  const sym = l ? `$${l.symbol}` : "Pons launch";
  const link = `${SITE}/launches/${token}${address ? `?ref=${address}` : ""}`;
  async function share() {
    const text = !l ? "On Stoa:" : l.graduated ? `${sym} graduated from its Pons curve.` : `${sym} is ${l.progress.toFixed(0)}% of the way to graduation on its Pons curve.`;
    if ((await shareOrCopy(link, text)) === "copied") { setCopied(true); setTimeout(() => setCopied(false), 1600); }
  }
  const trade = `/trade?chain=robinhood${l?.tradeFrom === "USDG" ? "&sell=USDG" : ""}&buy=${token}`;
  const isStoa = token.toLowerCase() === CA.toLowerCase();
  const pairSym = l?.pairSymbol ?? "ETH";

  // graduated but not routable: the pool Pons created at graduation, if Stoa's V4 adapter does not know it yet.
  // Registering it is open to anyone (one small transaction); the watcher does the same, usually within the hour.
  const pub = usePublicClient({ chainId: ROBINHOOD.chain.id });
  const { isConnected } = useAccount();
  const { open } = useWalletModal();
  const { writeContractAsync } = useChainWrite();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: Hash } | null>(null);
  const V4 = ROBINHOOD.contracts.v4;
  const needPool = !!l && l.graduated && !l.routable && l.tradeFrom !== null;
  const pool = useQuery({
    queryKey: ["pons-grad-pool", token, needPool],
    enabled: needPool && !!pub && !!V4,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PoolKey | null> => {
      const base = l!.tradeFrom === "USDG" ? USDG.toLowerCase() : zeroAddress;
      const keys = (await findV4Pools(ROBINHOOD, token)).filter((k) =>
        k.hooks.toLowerCase() === PONS_HOOK && [k.currency0.toLowerCase(), k.currency1.toLowerCase()].includes(base));
      const known = (await pub!.readContract({ address: V4!, abi: v4AdapterAbi, functionName: "keysFor", args: [base === zeroAddress ? ROBINHOOD.wrapped : USDG, token] })) as PoolKey[];
      return keys.find((k) => !known.some((x) => sameKey(x, k))) ?? null;
    },
  });


  return (
    <>
      <PageHead eyebrow="PONS LAUNCH · ROBINHOOD CHAIN" title={sym} action={<button type="button" className="cta" onClick={share}>{copied ? "Link copied" : "Share"}</button>}>
        {l ? <>{l.name}{l.graduated ? ", graduated from its Pons curve to Uniswap V4." : ", on its Pons bonding curve."}</> : q.isError ? "This token could not be read right now." : "Reading the token from the chain…"}
      </PageHead>
      {net.key !== "robinhood" && <div className="notice" style={{ marginBottom: 16 }}>Pons runs on Robinhood Chain. Trading from this page switches you there.</div>}
      {q.isError && !l && <div className="err" style={{ marginBottom: 16 }}>{(q.error as Error).message === "not a Pons launch" ? "This address is not a Pons launch." : "Robinhood Chain did not answer. It retries every 10 seconds."}</div>}

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span aria-hidden style={{ position: "relative", overflow: "hidden", width: 56, height: 56, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#EAF1FB", color: "var(--accent)", fontWeight: 700, fontSize: 22, flex: "none" }}>
            {l?.symbol[0] ?? "?"}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {l?.logo && <img src={l.logo} alt="" width={56} height={56} style={{ position: "absolute", inset: 0, width: 56, height: 56, objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{l ? l.symbol : <Sk w={90} />}{isStoa && <span className="chip live" style={{ marginLeft: 8 }}>Stoa&apos;s token</span>}<CoverChip token={token} /></div>
            <div style={{ fontSize: 13, color: "var(--muted)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis" }}>{token}</div>
          </div>
          {l && <span className="chip">{l.graduated ? "Graduated · Uniswap V4" : "On its Pons curve"}</span>}
        </div>

        {(!l || !l.graduated) && (
          <div style={{ marginTop: 18 }}>
            <div style={{ height: 12, borderRadius: 999, background: "#E6ECF5", overflow: "hidden" }}><div style={{ width: `${l?.progress ?? 0}%`, height: "100%", background: "var(--accent)", transition: "width .6s" }} /></div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 6, fontSize: 13, color: "var(--muted)", fontFamily: "var(--num)" }}>
              <span>{l ? `${l.progress.toFixed(1)}% to graduation` : <Sk w={120} />}</span>
              <span>{l ? `${(+l.raised).toLocaleString("en-US", { maximumFractionDigits: l.native ? 3 : 2 })} / ${(+l.threshold).toLocaleString("en-US", { maximumFractionDigits: 1 })} ${pairSym}` : ""}</span>
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {l?.routable
            ? <Link className="cta" href={trade}>Trade {sym} on Stoa{l.tradeFrom === "USDG" ? " (from USDG)" : ""}</Link>
            : <a className="cta" href={PONS(token)} target="_blank" rel="noopener noreferrer">{l?.graduated ? "Open on Pons ↗" : "Buy on Pons ↗"}</a>}
          {l?.routable && <a className="ghost" href={PONS(token)} target="_blank" rel="noopener noreferrer">Pons page ↗</a>}
          {isStoa && <Link className="ghost" href="/token">About $STOA</Link>}
          <Link className="note" style={{ marginTop: 0 }} href="/launches">All launches</Link>
        </div>
        {msg && <div className={msg.ok ? "notice" : "err"} style={{ marginTop: 12, marginBottom: 0 }}>{msg.text}{msg.hash && <> · <a href={txUrlOn(ROBINHOOD, msg.hash)} target="_blank" rel="noopener noreferrer">View</a></>}</div>}
        {l?.routable && l.tradeFrom === "USDG" && (
          <p className="note">This launch was priced in USDG on Pons, so its pool pairs it with USDG: trade it on Stoa from USDG. Holding ETH? Swap it to USDG first.</p>
        )}
        {l && !l.routable && (
          <p className="note">
            {l.graduated && l.tradeFrom === null
              ? <>This launch was priced in {pairSym} on Pons, so its Uniswap V4 pool pairs it with {pairSym}. Stoa routes the graduation pools paired with ETH or USDG only; trade it on Pons.</>
              : l.graduated
              ? <>Its Uniswap V4 pool is not in Stoa&apos;s router yet. Stoa&apos;s keeper adds new graduation pools, usually within the hour.</>
              : !l.native
              ? <>This launch is priced in {pairSym} on Pons. Stoa trades Pons curves priced in ETH; buy this one on Pons until it graduates.</>
              : ponsLive
                ? <>Stoa does not route this curve right now: it skips the first seconds after a launch, while Pons charges its anti-sniper tax, and leaves the buy that would graduate a curve to Pons. Buy on Pons, or try again shortly.</>
                : <>Stoa trades Pons curves once its curve adapter is in the router (scheduled for 18 Nov, behind a 48-hour timelock). Until then, buy on Pons.</>}
          </p>
        )}
      </div>

      <CoverPanel token={token} symbol={sym} />
      <SafetyPanel chain="robinhood" token={token} />
      <CmcPanel token={token} note="context only, the price you get is Stoa's quote" />

      <div className="grid3 sgrid" style={{ marginBottom: 16 }}>
        <Cell label="MARKET CAP" v={l ? usd(l.mcapUsd) : undefined} sub={l ? `${l.native && +l.mcapEth > 0 ? `${(+l.mcapEth).toLocaleString("en-US")} ETH · ` : ""}${l.supply.toLocaleString("en-US")} supply` : undefined} />
        <Cell label="PRICE" v={l ? px(l.priceUsd) : undefined} sub={l ? (l.priceUsd === null ? `Priced in ${pairSym}` : l.graduated ? "Stoa's best quote for a small buy" : "Spot price on the curve") : undefined} />
        <Cell label="CREATOR TAX" v={l ? `${(l.creatorTaxBps / 100).toFixed(1)}%` : undefined} sub={l ? (l.graduated ? "Was charged on curve trades" : "On each curve buy and sell, plus Pons' 1% fee") : undefined} />
      </div>

      <div className="panel pad">
        <div className="lbl">ABOUT THIS LAUNCH</div>
        <ul className="list">
          <li>Launched <b>{l?.launchedAt ? `${age(l.launchedAt)} ago` : "—"}</b></li>
          <li>Token <b><a href={addressUrlOn(ROBINHOOD, token)} target="_blank" rel="noopener noreferrer">Blockscout ↗</a></b></li>
          <li>Pons curve <b>{l ? <a href={addressUrlOn(ROBINHOOD, l.curve)} target="_blank" rel="noopener noreferrer">Blockscout ↗</a> : "—"}</b></li>
        </ul>
        <p className="note">
          Unverified launch, not reviewed by Stoa: anyone can launch a token on Pons, and most go to zero. Numbers are read from Robinhood Chain and refresh every 10 seconds. <Link href="/docs/trade-pons">How Pons trading on Stoa works</Link>.
        </p>
        <p className="note">
          {address
            ? <>The Share link carries your referral: you earn 10% of Stoa&apos;s protocol fee on the swaps it brings, claimable on <Link href="/referrals">Referrals</Link>.</>
            : <>Connect a wallet and the Share link carries your referral (10% of Stoa&apos;s protocol fee on the swaps it brings).</>}
        </p>
      </div>

      <div style={{ marginTop: 16 }}>
        <TokenShare chain="robinhood" address={token} symbol={sym} page={`/launches/${token}`} />
      </div>
    </>
  );
}

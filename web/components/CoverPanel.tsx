"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient, useReadContracts, useSwitchChain } from "wagmi";
import { useChainWrite } from "@/lib/chainWrite";
import { erc20Abi as symbolAbi, type Address, type Hash } from "viem";
import { ROBINHOOD, addressUrlOn, txUrlOn } from "@/lib/networks";
import { BREACHED, COVER, GRACE, RELEASED, SALE_STOP, coverAbi, eth, explainCover, pct, until, useCoverLive, useTerm, when, type Term } from "@/lib/cover";
import type { CreatorHistory } from "@/lib/creatorHistory";

const chainId = ROBINHOOD.chain.id;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const tok = (v: bigint) => (Number(v) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 });

/** "Covered" chip for a token, read from the cover contract (nothing before Rug Cover is live) */
export function CoverChip({ token }: { token: Address }) {
  const live = useCoverLive();
  const t = useTerm(token, live);
  if (!t.data?.open) return null;
  return <span className={`chip${t.data.holding ? "" : " warn"}`} style={{ marginLeft: 8 }}>{t.data.holding ? "Covered" : "Creator below floor"}</span>;
}

/** Rug Cover on a Pons token's page: the open cover (or that there is none), a breach button when the creator's wallet
 *  is below its floor, earlier terms, and what the creator wallet bought at launch and holds now. */
export default function CoverPanel({ token, symbol }: { token: Address; symbol: string }) {
  const live = useCoverLive();
  const t = useTerm(token, live);
  const v = t.data;
  const pub = usePublicClient({ chainId });
  const { isConnected, chainId: cur } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useChainWrite();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: Hash } | null>(null);
  const hist = useQuery({
    queryKey: ["creator-history", token],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/cover/creator/${token}`);
      if (!r.ok) throw new Error("unavailable");
      return (await r.json()) as CreatorHistory;
    },
  });
  // earlier terms: how many ended released, how many breached
  const ids = v ? Array.from({ length: Number(v.id) }, (_, i) => BigInt(i + 1)) : [];
  const past = useReadContracts({
    contracts: ids.map((id) => ({ address: COVER!, abi: coverAbi, functionName: "term" as const, args: [token, id] as const, chainId })),
    query: { enabled: live && ids.length > 0 },
  });
  const terms = (past.data ?? []).map((x) => x.result as unknown as Term | undefined).filter((x): x is Term => !!x);
  const breaches = terms.filter((x) => x.status === BREACHED).length, releases = terms.filter((x) => x.status === RELEASED).length;

  async function breach() {
    if (!pub) return;
    setBusy(true); setMsg(null);
    try {
      const hash = await writeContractAsync({ address: COVER!, abi: coverAbi, functionName: "breach", args: [token], chainId });
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("Transaction reverted");
      setMsg({ ok: true, text: "Breach confirmed: covered buyers can claim on Rug Cover. Withdraw your bounty there.", hash });
      t.refetch(); void past.refetch();
    } catch (e) { setMsg({ ok: false, text: explainCover(e) }); } finally { setBusy(false); }
  }

  const h = hist.data;
  const devBuy = h ? BigInt(h.devBuy) : 0n, bal = h ? BigInt(h.balance) : 0n, supply = h ? BigInt(h.supply) : 0n;
  const gone = devBuy > bal ? devBuy - bal : 0n;
  const history = h && (
    <ul className="list">
      <li>Creator wallet <b><a href={addressUrlOn(ROBINHOOD, h.creator)} target="_blank" rel="noopener noreferrer">{short(h.creator)} ↗</a></b></li>
      <li>Bought in the first minute <b>{devBuy > 0n ? `${tok(devBuy)} · ${pct(devBuy, supply)}% of supply` : "nothing"}</b></li>
      <li>Holds now <b>{tok(bal)} · {pct(bal, supply)}% of supply</b></li>
      {gone > 0n && <li>Sold or moved since <b style={{ color: "#B4442E" }}>{tok(gone)} · {pct(gone, devBuy, 0)}% of that buy</b></li>}
      {live && <li>Rug Cover terms <b>{terms.length === 0 ? "none yet" : `${terms.length} · ${releases} released · ${breaches} breached`}</b></li>}
    </ul>
  );

  return (
    <div className="panel pad" style={{ marginBottom: 16 }}>
      <div className="rowx">
        <div className="lbl">RUG COVER</div>
        {live && <span className={`chip${v?.open && !v.holding ? " warn" : ""}`}>{!v?.open ? "Not covered" : v.holding ? "Covered" : "Creator below floor"}</span>}
      </div>
      {!live ? (
        <p className="note">Rug Cover is coming: a token&apos;s creator bonds ETH behind a promise not to sell or move the tokens in their wallet, and buyers who buy with cover claim their ETH back if that wallet dumps. <Link href="/cover">How it works</Link></p>
      ) : !v?.open ? (
        <p className="note">
          {symbol}&apos;s creator has no open cover{v ? ` (last term ${v.term.status === RELEASED ? "ended with the bond released" : "was breached"})` : ""}. Buys of {symbol} are not covered.{" "}
          Creator? <Link href="/cover">Open a cover</Link> and your token shows as Covered on Stoa.
        </p>
      ) : (
        <>
          <p style={{ marginTop: 8 }}>
            {v.holding
              ? <>The creator bonded <b>{eth(v.term.bond, 3)} ETH</b> behind a promise to keep at least {pct(v.term.floor, v.supply)}% of supply in their wallet until they release the bond. Buy with cover and, if that wallet drops below it first, you claim the ETH you spent.</>
              : <>The creator promised to keep {pct(v.term.floor, v.supply)}% of supply and now holds <b>{pct(v.balance, v.supply)}%</b>. The cover can be breached now: covered buyers then claim their ETH from the {eth(v.term.bond, 3)} ETH bond.</>}
          </p>
          <div className="det" style={{ marginTop: 10 }}>
            <span>Cover left</span><span>{eth(v.left, 3)} of {eth(v.term.capacity, 3)} ETH</span>
            {v.holding && <><span>Covered buys close</span><span>{Number(v.term.endsAt) - SALE_STOP > Date.now() / 1000 ? `in ${until(Number(v.term.endsAt) - SALE_STOP)}` : "closed"}</span></>}
            <span>Release from</span><span>{when(Number(v.term.endsAt) + GRACE)}</span>
            {v.holding && <><span>Premium</span><span>{v.term.premiumBps / 100}% of the ETH you spend, burned as $STOA</span></>}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {v.holding
              ? v.salesLeft > 0 && v.left > 0n && <Link className="cta" href={`/trade?chain=robinhood&sell=ETH&buy=${token}&cover=1`}>Buy {symbol} with cover</Link>
              : !isConnected ? <Link className="cta" href="/cover">Breach on Rug Cover</Link>
              : cur !== chainId ? <button className="cta" type="button" onClick={() => switchChain({ chainId })}>Switch to Robinhood Chain</button>
              : <button className="cta" type="button" disabled={busy} onClick={breach}>{busy ? "Breaching…" : `Breach · earn ${eth(v.term.bond * BigInt(v.term.bountyBps) / 10_000n, 4)} ETH`}</button>}
            <Link className="ghost" href="/cover">Rug Cover</Link>
          </div>
        </>
      )}
      {msg && <div className={msg.ok ? "ok" : "err"} style={{ marginTop: 10 }}>{msg.text}{msg.hash && <> · <a href={txUrlOn(ROBINHOOD, msg.hash)} target="_blank" rel="noopener noreferrer">View</a></>}</div>}
      {history}
      <p className="note">Rug Cover watches one wallet: the one that launched {symbol} on Pons. Tokens it moved to other wallets before a cover opened, and other holders selling, are not covered.</p>
    </div>
  );
}

/** Tokens whose creator has an open cover, as links: on /tokens. Nothing until Rug Cover is live and a cover opens. */
export function CoveredStrip() {
  const live = useCoverLive();
  const r = useReadContracts({ contracts: [{ address: COVER!, abi: coverAbi, functionName: "openTokens", chainId }], query: { enabled: live, refetchInterval: 60_000 } });
  const list = (r.data?.[0]?.result as Address[] | undefined) ?? [];
  const syms = useReadContracts({
    contracts: list.map((a) => ({ address: a, abi: symbolAbi, functionName: "symbol" as const, chainId })),
    query: { enabled: list.length > 0 },
  });
  if (!live || !list.length) return null;
  return (
    <div className="panel pad" style={{ marginBottom: 20 }}>
      <div className="rowx"><div className="lbl">COVERED BY THEIR CREATORS · ROBINHOOD CHAIN</div><Link className="note" style={{ marginTop: 0 }} href="/cover">Rug Cover →</Link></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {list.map((a, i) => <Link key={a} className="chip cov" style={{ marginLeft: 0, padding: "4px 10px", fontSize: 12.5 }} href={`/launches/${a}`}>{String(syms.data?.[i]?.result ?? short(a)).replace(/[^\w.$-]/g, "").slice(0, 12)}</Link>)}
      </div>
      <p className="note">Each creator bonded ETH behind a promise not to sell or move the tokens in their wallet. Buy with cover on Trade and claim your ETH back if that wallet dumps.</p>
    </div>
  );
}

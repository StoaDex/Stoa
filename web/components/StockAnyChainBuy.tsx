"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useBalance, usePublicClient, useSendTransaction, useSwitchChain } from "wagmi";
import { BaseError, parseEventLogs, parseUnits, type Address, type Hash } from "viem";
import { SOURCES } from "@/lib/bridge";
import { fmt } from "@/lib/swap";
import { CROSS_BUY, CROSS_BUY_ABI, STOCK_MAX_USD, STOCK_SOURCES, checkStockQuote, type StockQuote } from "@/lib/stockAnychain";
import { useWalletModal } from "./Providers";

type Phase =
  | { k: "idle" }
  | { k: "signing" }
  | { k: "moving"; tx: Hash; q: StockQuote; from: bigint; since: number }
  | { k: "done"; got: bigint | null; refunded: boolean; tx: string | null }
  | { k: "failed"; text: string };

const RH_EXPLORER = "https://robinhoodchain.blockscout.com";
const QUOTE_TTL = 40_000;
const srcs = SOURCES.filter((s) => (STOCK_SOURCES as readonly number[]).includes(s.chain.id));

function explain(e: unknown): string {
  if (e instanceof BaseError) {
    if (/User rejected|denied/i.test(e.shortMessage)) return "You rejected the request in your wallet.";
    if (/insufficient funds/i.test(e.shortMessage)) return "Not enough ETH for this and the gas on the source chain.";
    return e.shortMessage;
  }
  return (e as Error)?.message ?? "Something went wrong.";
}

/** Buy a Robinhood stock token with ETH from Base, Arbitrum, Optimism or Ethereum, in one transaction
 *  (lib/stockAnychain.ts says what is checked before the wallet opens). */
export default function StockAnyChainBuy({ stock, symbol }: { stock: Address; symbol: string }) {
  const { address, isConnected, chainId } = useAccount();
  const { open: openWallet } = useWalletModal();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const [srcId, setSrcId] = useState<number>(srcs[0].chain.id);
  const src = srcs.find((s) => s.chain.id === srcId) ?? srcs[0];
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<(StockQuote & { at: number }) | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const busy = phase.k === "signing" || phase.k === "moving";
  const pub = usePublicClient({ chainId: src.chain.id });
  const rh = usePublicClient({ chainId: 4663 });
  const bal = useBalance({ address, chainId: src.chain.id, query: { enabled: !!address } });
  const ethOut = useMemo(() => { try { return amount && Number(amount) > 0 ? parseUnits(amount, 18) : undefined; } catch { return undefined; } }, [amount]);
  const ref = useRef<string | null>(null);
  useEffect(() => { try { ref.current = localStorage.getItem("stoa.ref"); } catch { /* blocked */ } }, []);

  async function fetchQuote() {
    const r = await fetch("/api/anychain/stock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chainId: src.chain.id, user: address, stock, ethOut: ethOut!.toString(), referrer: ref.current ?? undefined }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof j.error === "string" && /limited|halted|Only/.test(j.error) ? j.error : r.status === 429 ? "Too many quotes right now. Wait a few seconds." : "No route Stoa can check for this amount right now. Try another amount.");
    // checked again here, against what the buyer picked, whatever the server said
    const why = checkStockQuote(j as StockQuote, { user: address!, chainId: src.chain.id, stock, ethOut: ethOut! });
    if (why) throw new Error(why);
    return { ...(j as StockQuote), at: Date.now() };
  }

  const seq = useRef(0);
  useEffect(() => {
    setQuote(null); setQErr(null);
    if (!ethOut || !address || busy) { setLoading(false); return; }
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const q = await fetchQuote(); if (my === seq.current) setQuote(q); }
      catch (e) { if (my === seq.current) setQErr((e as Error).message); }
      finally { if (my === seq.current) setLoading(false); }
    }, 700);
    return () => clearTimeout(t);
  }, [ethOut, address, src.chain.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // follow the delivery: Relay's status, then StoaCrossBuy's Bought or Refunded event for this buyer on Robinhood Chain
  useEffect(() => {
    if (phase.k !== "moving" || !rh) return;
    let stop = false;
    const { q, from, since } = phase;
    const tick = async () => {
      if (stop) return;
      try {
        const logs = await rh.getLogs({ address: CROSS_BUY, fromBlock: from, toBlock: "latest" });
        const ev = parseEventLogs({ abi: CROSS_BUY_ABI, logs }).find((l) => l.args.to.toLowerCase() === q.user.toLowerCase() && l.args.tokenOut.toLowerCase() === stock.toLowerCase());
        if (ev) {
          setPhase(ev.eventName === "Bought" ? { k: "done", got: ev.args.amountOut, refunded: false, tx: ev.transactionHash } : { k: "done", got: null, refunded: true, tx: ev.transactionHash });
          return;
        }
        const s = await fetch(`https://api.relay.link/intents/status/v3?requestId=${q.requestId}`).then((r) => r.json()).catch(() => null) as { status?: string } | null;
        if (s?.status === "refund" || s?.status === "failure") {
          setPhase({ k: "failed", text: "Relay could not deliver this order, so it refunds your ETH on the source chain. Nothing reached Robinhood Chain." });
          return;
        }
      } catch { /* try again */ }
      if (Date.now() - since > 45 * 60_000) { setPhase({ k: "failed", text: "This is taking much longer than usual. Your deposit is with Relay; check it on relay.link with the source transaction." }); return; }
      setTimeout(tick, 5000);
    };
    void tick();
    return () => { stop = true; };
  }, [phase, rh, stock]);

  async function go() {
    if (!quote || !address || busy) return;
    setPhase({ k: "signing" });
    try {
      let q = quote;
      if (Date.now() - q.at > QUOTE_TTL) { q = await fetchQuote(); setQuote(q); }
      if (chainId !== src.chain.id) await switchChainAsync({ chainId: src.chain.id });
      const code = await pub!.getCode({ address });
      if (code && code !== "0x") throw new Error(`This wallet is a smart contract. ${symbol} arrives at the same address on Robinhood Chain, which a smart wallet may not control there, so this only works with a regular wallet.`);
      const from = await rh!.getBlockNumber();
      const tx = await sendTransactionAsync({ chainId: src.chain.id, to: q.tx.to, data: q.tx.data, value: BigInt(q.tx.value) });
      setPhase({ k: "moving", tx, q, from, since: Date.now() });
    } catch (e) {
      setPhase({ k: "failed", text: explain(e) });
    }
  }

  const pay = quote ? BigInt(quote.tx.value) : undefined;
  const short = pay !== undefined && bal.data !== undefined && pay > bal.data.value;
  let label = `Buy ${symbol}`;
  if (!isConnected) label = "Connect wallet";
  else if (!ethOut) label = "Enter an amount";
  else if (loading) label = "Checking the route…";
  else if (qErr) label = "No route";
  else if (short) label = `Not enough ETH on ${src.name}`;
  else if (phase.k === "signing") label = "Confirm in your wallet…";
  else if (phase.k === "moving") label = "On its way…";

  return (
    <div className="panel pad" style={{ marginBottom: 16 }} id="any-chain">
      <div className="rowx"><div className="lbl">BUY {symbol} WITH ETH FROM ANOTHER CHAIN</div><span className="chip">one transaction · via Relay</span></div>
      {phase.k === "done" ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 18, margin: "6px 0" }}>{phase.refunded ? `The ${symbol} price moved past your minimum, so the ETH went to your wallet on Robinhood Chain instead.` : phase.got !== null ? `${fmt(phase.got, quote?.decimals ?? 18, 4)} ${symbol} arrived on Robinhood Chain.` : `Your ${symbol} is on Robinhood Chain.`}</p>
          {phase.tx && <a className="note" href={`${RH_EXPLORER}/tx/${phase.tx}`} target="_blank" rel="noopener noreferrer">See it on Robinhood Chain ↗</a>}
          <div style={{ marginTop: 10 }}><button type="button" className="ghost" onClick={() => { setPhase({ k: "idle" }); setAmount(""); }}>Buy again</button></div>
        </div>
      ) : (
        <>
          <p className="note" style={{ marginTop: 6 }}>Pay with ETH on another chain; {symbol} arrives in the same wallet on Robinhood Chain. If its price moves past your minimum on the way, you get the ETH on Robinhood Chain instead.</p>
          <div className="seg" role="tablist" aria-label="Pay from" style={{ marginTop: 8, flexWrap: "wrap" }}>
            {srcs.map((s) => <button key={s.key} type="button" role="tab" aria-selected={s.chain.id === src.chain.id} className={s.chain.id === src.chain.id ? "on" : undefined} disabled={busy} onClick={() => setSrcId(s.chain.id)}>{s.name}</button>)}
          </div>
          <div className="box" style={{ marginTop: 12 }}>
            <div className="row"><label className="lbl" htmlFor="sacb-amt">ETH FOR {symbol}</label><span className="lbl">{address && bal.data ? `ON ${src.name.toUpperCase()} ${fmt(bal.data.value, 18, 4)}` : ""}</span></div>
            <div className="row">
              <input id="sacb-amt" type="text" inputMode="decimal" placeholder="0.00" autoComplete="off" value={amount} readOnly={busy}
                onChange={(e) => { setPhase({ k: "idle" }); setAmount(e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "")); }} />
              <b>ETH</b>
            </div>
          </div>
          {quote && (
            <div className="det">
              <span>You pay on {src.name}</span><span>{fmt(BigInt(quote.tx.value), 18, 6)} ETH{quote.inUsd ? ` (~$${quote.inUsd.toFixed(2)})` : ""}</span>
              <span>You receive about</span><span>{fmt(BigInt(quote.out), quote.decimals, 4)} {symbol}</span>
              <span>At least</span><span>{fmt(BigInt(quote.minOut), quote.decimals, 4)} {symbol}</span>
              <span>Delivery</span><span>{quote.etaSeconds && quote.etaSeconds < 120 ? "usually under a minute" : "a few minutes"}</span>
            </div>
          )}
          {qErr && <div className="notice" style={{ marginTop: 10 }}>{qErr}</div>}
          {phase.k === "failed" && <div className="notice" style={{ marginTop: 10 }}>{phase.text}</div>}
          {phase.k === "moving" && <p className="note" style={{ marginTop: 10 }}>Sent. Your {symbol} is on its way to the same address on Robinhood Chain. You can leave this page. <a href={`https://relay.link/transaction/${phase.q.requestId}`} target="_blank" rel="noopener noreferrer">Follow it on Relay ↗</a></p>}
          <button type="button" className="big pri" style={{ marginTop: 12, width: "100%" }} disabled={isConnected && (!quote || loading || short || busy)} onClick={() => (isConnected ? go() : openWallet())}>{label}</button>
          <p className="note" style={{ marginTop: 8 }}>Up to ${STOCK_MAX_USD} per purchase. Stoa checks the deposit and Relay&apos;s order before your wallet opens: every refund goes to you, and the only call on Robinhood Chain is the buy for your address. Stock Tokens are not offered in every country; not investment advice.</p>
        </>
      )}
    </div>
  );
}

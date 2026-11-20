"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useBalance, usePublicClient, useReadContract, useSendTransaction, useSwitchChain, useWriteContract } from "wagmi";
import { BaseError, erc20Abi, parseEventLogs, parseUnits, zeroAddress, type Hash } from "viem";
import { NATIVE_ZERO, SOURCES, USDT_MAINNET, sameAddr } from "@/lib/bridge";
import { ANYCHAIN_PUBLIC, DST_CHAIN, MAX_USD, RELAY_DEPOSITORY, STOA_RH, checkAnyQuote, depositIdOf, usdOf, type AnyQuote } from "@/lib/anychain";
import { fmt } from "@/lib/swap";
import { useWalletModal } from "./Providers";

type Phase =
  | { k: "idle" }
  | { k: "signing"; what: string }
  | { k: "moving"; tx: Hash; t: Ticket; min: string; since: number; depositAt?: number; slow?: boolean; unseen?: boolean }
  | { k: "done"; destTx: string | null; got: bigint | null }
  | { k: "failed"; text: string };

function explain(e: unknown): string {
  if (e instanceof BaseError) {
    if (/User rejected|denied/i.test(e.shortMessage)) return "You rejected the request in your wallet.";
    if (/insufficient funds/i.test(e.shortMessage)) return "Not enough for this and the gas on the source chain.";
    return e.shortMessage;
  }
  return (e as Error)?.message ?? "Something went wrong.";
}

const usd = (v?: number) => (v !== undefined && Number.isFinite(v) && v > 0 ? `$${v.toFixed(v < 1 ? 3 : 2)}` : null);
const QUOTE_TTL = 45_000;
const REQUOTE_TOLERANCE_BPS = 50n;
const gasReserve = (chainId: number) => (chainId === 1 ? 10n ** 16n : 3n * 10n ** 15n);
const RH_EXPLORER = "https://robinhoodchain.blockscout.com";
/** what /status and /receipt need back: the intent, who bought, from which chain, the order id, Stoa's signature */
type Ticket = { intentId: string; user: string; chainId: number; depositId: string; exp: number; sig: string };
const ticketOf = (q: AnyQuote, user: string, chainId: number): Ticket =>
  ({ intentId: q.intentId, user, chainId, depositId: depositIdOf(q.transaction.data) ?? "", exp: q.exp ?? 0, sig: q.sig ?? "" });
/** tell Trustware which source tx filled the intent; retried (409 = the source chain does not show the tx yet), since
 *  without it an ETH route stays pending. The status poll sends it again while the route still reads pending. */
async function sendReceipt(t: Ticket, txHash: Hash, waits = [0, 3000, 8000, 20000, 45000]) {
  for (const wait of waits) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const r = await fetch("/api/anychain/receipt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...t, txHash }) });
      if (r.ok || r.status === 400 || r.status === 403) return;
    } catch { /* retry */ }
  }
}
/** delivery transactions already counted on this device, so an older transfer is never shown as a new purchase */
const USED_KEY = "stoa-anychain-delivered";
function usedDeliveries(): string[] { try { return JSON.parse(localStorage.getItem(USED_KEY) ?? "[]"); } catch { return []; } }
function markDelivered(h: string) { try { localStorage.setItem(USED_KEY, JSON.stringify([...usedDeliveries(), h.toLowerCase()].slice(-50))); } catch { /* ignore */ } }

/** Buy $STOA from any chain: Trustware routes a deposit from Base, Arbitrum, Ethereum, Optimism or BNB Chain through
 *  Relay into $STOA on Robinhood Chain, to the same address (lib/anychain.ts says what is checked and why it is capped). */
export default function AnyChainBuy() {
  const [show, setShow] = useState(ANYCHAIN_PUBLIC);
  useEffect(() => { if (!ANYCHAIN_PUBLIC && new URLSearchParams(location.search).get("preview") === "anychain") setShow(true); }, []);
  if (!show) return null;
  return <Panel />;
}

function Panel() {
  const { address, isConnected, chainId } = useAccount();
  const { open: openWallet } = useWalletModal();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const [srcKey, setSrcKey] = useState(SOURCES[0].key);
  const src = SOURCES.find((s) => s.key === srcKey) ?? SOURCES[0];
  const [sTokAddr, setSTokAddr] = useState(src.tokens[0].address);
  const sTok = src.tokens.find((t) => sameAddr(t.address, sTokAddr)) ?? src.tokens[0];
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<(AnyQuote & { at: number }) | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const busy = phase.k === "signing" || phase.k === "moving";
  const pub = usePublicClient({ chainId: src.chain.id });
  const rh = usePublicClient({ chainId: DST_CHAIN });
  const going = useRef(false); // one purchase at a time, whatever the taps

  const native = sameAddr(sTok.address, NATIVE_ZERO);
  const nBal = useBalance({ address, chainId: src.chain.id, query: { enabled: !!address && native } });
  const tBal = useReadContract({ address: sTok.address, abi: erc20Abi, functionName: "balanceOf", args: [address ?? zeroAddress], chainId: src.chain.id, query: { enabled: !!address && !native } });
  const bal = native ? nBal.data?.value : (tBal.data as bigint | undefined);
  const amt = useMemo(() => { try { return amount && Number(amount) > 0 ? parseUnits(amount, sTok.decimals) : undefined; } catch { return undefined; } }, [amount, sTok.decimals]);
  const tooMuch = amt !== undefined && bal !== undefined && amt > bal;

  async function fetchQuote(): Promise<AnyQuote & { at: number }> {
    const r = await fetch("/api/anychain/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chainId: src.chain.id, token: sTok.address, amount: amt!.toString(), user: address }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof j.error === "string" && j.error.startsWith("Buying") ? j.error : r.status === 429 ? "Too many quotes right now. Wait a few seconds." : "No route Stoa can check for this amount right now. Try another token or amount.");
    // checked again here, against what the user picked, whatever the server said
    const why = checkAnyQuote(j as AnyQuote, { user: address!, chainId: src.chain.id, token: sTok.address, amount: amt! });
    if (why) throw new Error(why);
    return { ...(j as AnyQuote), at: Date.now() };
  }

  const seq = useRef(0);
  useEffect(() => {
    setQuote(null); setQErr(null);
    if (!amt || !address || busy) { setLoading(false); return; }
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const q = await fetchQuote(); if (my === seq.current) setQuote(q); }
      catch (e) { if (my === seq.current) setQErr((e as Error).message); }
      finally { if (my === seq.current) setLoading(false); }
    }, 700);
    return () => clearTimeout(t);
  }, [amt, address, src.key, sTok.address]); // eslint-disable-line react-hooks/exhaustive-deps

  // follow the delivery (Relay usually fills within a minute; give up waiting after 45)
  useEffect(() => {
    if (phase.k !== "moving") return;
    let stop = false;
    const { t, min, since, depositAt } = phase;
    const buyer = t.user; // who bought is fixed when the deposit is sent, whatever account is connected later
    let receiptAt = Date.now();
    const tick = async () => {
      if (stop) return;
      try {
        const qs = new URLSearchParams({ intentId: t.intentId, user: t.user, chainId: String(t.chainId), depositId: t.depositId, exp: String(t.exp), sig: t.sig });
        const r = await fetch(`/api/anychain/status?${qs}`);
        const j = await r.json();
        if (stop) return;
        // still pending: tell Trustware the source tx again now and then (a receipt lost early would leave it pending)
        if ((j.status === "pending" || j.status === "unknown") && Date.now() - receiptAt > 30_000) {
          receiptAt = Date.now();
          setPhase((p) => { if (p.k === "moving") void sendReceipt(p.t, p.tx, [0]); return p; });
        }
        if (j.status === "success" && typeof j.destTx === "string" && /^0x[0-9a-fA-F]{64}$/.test(j.destTx) && rh) {
          // done only once Robinhood Chain shows the $STOA reaching the buyer, at least the minimum that was shown, in a
          // transaction mined after the deposit was sent and not already counted for an earlier purchase
          const rc = await rh.getTransactionReceipt({ hash: j.destTx as Hash }).catch(() => null);
          const blk = rc ? await rh.getBlock({ blockNumber: rc.blockNumber }).catch(() => null) : null;
          // "after the deposit" by the deposit's own block time when known (no device clock), else by when it was sent
          const fresh = !!blk && Number(blk.timestamp) * 1000 >= (depositAt ?? since) - 120_000 && !usedDeliveries().includes(j.destTx.toLowerCase());
          const got = rc && fresh ? parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: rc.logs.filter((l) => sameAddr(l.address, STOA_RH)) })
            .filter((l) => sameAddr(l.args.to, buyer)).reduce((a, l) => a + l.args.value, 0n) : 0n;
          if (got >= BigInt(min)) { markDelivered(j.destTx); return setPhase({ k: "done", destTx: j.destTx, got }); }
          // the route says delivered but Robinhood Chain does not show it: say so now, keep checking
          if (rc || blk) setPhase((p) => (p.k === "moving" && !p.unseen ? { ...p, unseen: true } : p));
        }
        if (j.status === "success" && !j.destTx) setPhase((p) => (p.k === "moving" && !p.unseen ? { ...p, unseen: true } : p));
        if (j.status === "failed" || j.status === "expired") return setPhase({ k: "failed", text: "The route reports this purchase failed. Check the source transaction and your wallet there; if nothing comes back, contact Stoa with the source transaction hash." });
      } catch { /* next tick */ }
      if (Date.now() - since > 45 * 60_000) return setPhase({ k: "failed", text: "Still not confirmed after 45 minutes. Check your wallet on Robinhood Chain before trying again." });
      setTimeout(tick, 4000);
    };
    const timer = setTimeout(tick, 4000);
    return () => { stop = true; clearTimeout(timer); };
  }, [phase.k === "moving" ? phase.t.intentId : null, rh]); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    if (!quote || !address || !amt || going.current) return;
    going.current = true;
    try {
      if (chainId !== src.chain.id) { setPhase({ k: "signing", what: `Switch your wallet to ${src.name}` }); await switchChainAsync({ chainId: src.chain.id }); }
      const code = await pub!.getCode({ address });
      if (code && code !== "0x" && !code.toLowerCase().startsWith("0xef0100")) {
        throw new Error("This wallet is a smart contract. $STOA arrives at the same address on Robinhood Chain, which a smart wallet may not control there, so this only works with a regular wallet.");
      }
      let q = quote;
      if (Date.now() - quote.at > QUOTE_TTL || (quote.expiresAt && Date.parse(quote.expiresAt) - Date.now() < 60_000)) {
        q = await fetchQuote();
        setQuote(q);
        const shown = BigInt(quote.estimate.toAmountMin), now = BigInt(q.estimate.toAmountMin);
        if (now * 10_000n < shown * (10_000n - REQUOTE_TOLERANCE_BPS)) {
          setPhase({ k: "idle" });
          setQErr(`The price moved since you looked: you'd now receive at least ${fmt(now, 18, 2)} $STOA. Check the new quote and tap again.`);
          return;
        }
      }
      const why = checkAnyQuote(q, { user: address, chainId: src.chain.id, token: sTok.address, amount: amt });
      if (why) throw new Error(why);
      if (!native) {
        const allowance = await pub!.readContract({ address: sTok.address, abi: erc20Abi, functionName: "allowance", args: [address, RELAY_DEPOSITORY] });
        if (allowance < amt) {
          if (allowance > 0n && sameAddr(sTok.address, USDT_MAINNET)) {
            setPhase({ k: "signing", what: "Reset the USDT allowance (USDT needs this first)" });
            await pub!.waitForTransactionReceipt({ hash: await writeContractAsync({ address: sTok.address, abi: erc20Abi, functionName: "approve", args: [RELAY_DEPOSITORY, 0n], chainId: src.chain.id }) });
          }
          setPhase({ k: "signing", what: `Approve ${fmt(amt, sTok.decimals, 4)} ${sTok.symbol}` });
          const ah = await writeContractAsync({ address: sTok.address, abi: erc20Abi, functionName: "approve", args: [RELAY_DEPOSITORY, amt], chainId: src.chain.id });
          const ar = await pub!.waitForTransactionReceipt({ hash: ah });
          if (ar.status !== "success") throw new Error("The approval failed. Nothing was sent.");
        }
      }
      const t = q.transaction;
      setPhase({ k: "signing", what: `Buy $STOA with ${fmt(amt, sTok.decimals, 4)} ${sTok.symbol}` });
      const tx = await sendTransactionAsync({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : 0n, chainId: Number(t.chainId), gas: t.gasLimit ? (BigInt(t.gasLimit) * 13n) / 10n : undefined });
      const ticket = ticketOf(q, address, src.chain.id);
      void sendReceipt(ticket, tx);
      const moving = { k: "moving" as const, tx, t: ticket, min: q.estimate.toAmountMin, since: Date.now() };
      // the deposit is sent: from here the page follows it and never offers a second purchase for it. If the wallet
      // speeds it up (same deposit, new gas), the new hash is the one that counts and goes to Trustware; if the wallet
      // replaces or cancels it with any other transaction, nothing was bought.
      let gone: "cancelled" | "replaced" | null = null;
      const rc = await pub!.waitForTransactionReceipt({
        hash: tx, timeout: 180_000,
        onReplaced: (r) => { if (r.reason === "repriced") void sendReceipt(ticket, r.transaction.hash); else gone = r.reason; },
      }).catch(() => null);
      if (gone === "cancelled") throw new Error("You cancelled the deposit in your wallet. Nothing was bought.");
      if (gone === "replaced") throw new Error("Your wallet replaced the deposit with another transaction. Nothing was bought.");
      if (rc && rc.status !== "success") throw new Error(`The transaction failed on ${src.name}. Nothing was sent.`);
      const depositAt = rc ? await pub!.getBlock({ blockNumber: rc.blockNumber }).then((b) => Number(b.timestamp) * 1000).catch(() => undefined) : undefined;
      setPhase(rc ? { ...moving, tx: rc.transactionHash, depositAt } : { ...moving, slow: true });
    } catch (e) { setPhase({ k: "failed", text: explain(e) }); } finally { going.current = false; }
  }

  const reset = () => { setPhase({ k: "idle" }); setAmount(""); setQuote(null); };
  const fees = quote ? (quote.estimate.fees ?? []).reduce((a, f) => a + Number(f.amountUsd ?? 0), 0) : 0;
  // how much less $STOA than Stoa's own price would give for the same dollars (swap impact plus fees)
  const ours = quote && address && amt ? usdOf({ user: address, chainId: src.chain.id, token: sTok.address, amount: amt }, quote.ethUsd) : null;
  const impact = quote && ours && quote.stoaPerUsd ? 1 - Number(BigInt(quote.estimate.toAmount)) / 1e18 / (ours * quote.stoaPerUsd) : null;

  let label = "Buy $STOA";
  if (!isConnected) label = "Connect wallet";
  else if (!amt) label = "Enter an amount";
  else if (tooMuch) label = `Not enough ${sTok.symbol} on ${src.name}`;
  else if (loading) label = "Finding a route…";
  else if (!quote) label = qErr ? "No route" : "Buy $STOA";
  else if (chainId !== src.chain.id) label = `Switch to ${src.name} and buy`;
  const disabled = isConnected && (!quote || tooMuch || loading || busy);

  return (
    <div className="panel pad" id="anychain" style={{ marginTop: 16 }}>
      <div className="rowx"><div className="lbl">BUY $STOA FROM ANY CHAIN</div><span className="chip">via Trustware · Relay</span></div>
      {phase.k === "done" ? (
        <div>
          <p style={{ fontSize: 20, margin: "10px 0 4px" }}>{phase.got ? `${fmt(phase.got, 18, 2)} $STOA arrived on Robinhood Chain.` : "Your $STOA is on Robinhood Chain."}</p>
          <p className="note" style={{ marginTop: 0 }}>Same wallet address. You can lock it in Spotlight to vote and earn projects&apos; ETH.</p>
          <Link href="/spotlight" className="big pri" style={{ display: "flex", justifyContent: "center", alignItems: "center", textDecoration: "none", marginTop: 14 }}>Lock in Spotlight</Link>
          {phase.destTx && <p className="note"><a href={`${RH_EXPLORER}/tx/${phase.destTx}`} target="_blank" rel="noopener noreferrer">Delivery on Robinhood Chain ↗</a></p>}
          <button type="button" className="ghost" style={{ marginTop: 8 }} onClick={reset}>Buy more</button>
        </div>
      ) : (
        <>
          <p className="note" style={{ marginTop: 6 }}>Pay with ETH or stablecoins on another chain; $STOA arrives in the same wallet on Robinhood Chain.</p>
          <div className="seg" role="tablist" aria-label="Pay from" style={{ marginTop: 8, flexWrap: "wrap" }}>
            {SOURCES.map((s) => <button key={s.key} type="button" role="tab" aria-selected={s.key === src.key} className={s.key === src.key ? "on" : undefined} disabled={busy} onClick={() => { setSrcKey(s.key); setSTokAddr(s.tokens[0].address); }}>{s.name}</button>)}
          </div>
          <div className="box" style={{ marginTop: 12 }}>
            <div className="row"><label className="lbl" htmlFor="aamt">YOU PAY</label>
              <button type="button" className="lbl" style={{ border: 0, background: "none", cursor: bal ? "pointer" : "default" }} disabled={busy}
                onClick={() => { const r = gasReserve(src.chain.id); if (bal) setAmount(fmt(native ? (bal > r ? bal - r : 0n) : bal, sTok.decimals, 8).replace(/,/g, "")); }}>
                BALANCE {bal !== undefined ? fmt(bal, sTok.decimals, 4) : "—"}
              </button></div>
            <div className="row">
              <input id="aamt" type="text" inputMode="decimal" placeholder="0.00" autoComplete="off" value={amount} readOnly={busy}
                onChange={(e) => { setPhase({ k: "idle" }); setAmount(e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "")); }} />
              <div className="seg">{src.tokens.map((t) => <button key={t.address} type="button" className={sameAddr(t.address, sTok.address) ? "on" : undefined} disabled={busy} onClick={() => setSTokAddr(t.address)}>{t.symbol}</button>)}</div>
            </div>
            {ours !== null && <div className="usd">≈ {usd(ours)}</div>}
          </div>
          <div className="lbl" style={{ marginTop: 16 }}>YOU GET ON ROBINHOOD CHAIN</div>
          <div className="box" style={{ marginTop: 8 }}>
            <div className="row">
              <span className="amt" style={{ fontFamily: "var(--num)", fontSize: 26 }}>{quote ? fmt(BigInt(quote.estimate.toAmount), 18, 2) : loading ? "…" : "0.00"}</span>
              <b>$STOA</b>
            </div>
            {quote?.estimate.toAmountUsd && <div className="usd">≈ {usd(Number(quote.estimate.toAmountUsd))}</div>}
          </div>
          {quote && (
            <div className="det">
              <span>You receive at least</span><span>{fmt(BigInt(quote.estimate.toAmountMin), 18, 2)} $STOA</span>
              <span>Fees</span><span>{usd(fees) ?? "none"}</span>
              {impact === null && <><span>Vs Stoa&apos;s price</span><span>can&apos;t read Stoa&apos;s $STOA price right now</span></>}
              {impact !== null && <><span>Vs Stoa&apos;s price</span><span style={impact > 0.05 ? { color: "#B4442E", fontWeight: 600 } : undefined}>{impact > 0 ? `${(impact * 100).toFixed(1)}% less $STOA` : "about the same"}</span></>}
              <span>Arrives in</span><span>{!quote.estimate.etaSeconds || quote.estimate.etaSeconds < 90 ? "about a minute" : `about ${Math.round(quote.estimate.etaSeconds / 60)} minutes`}</span>
              <span>Route</span><span>Relay, via Trustware</span>
            </div>
          )}
          {impact !== null && impact > 0.05 && <div className="notice" style={{ marginTop: 12 }}>This route gives {(impact * 100).toFixed(1)}% less $STOA than Stoa&apos;s own price for the same amount, mostly price impact in the $STOA pool. A smaller amount, or bridging in and swapping on Stoa, may get you more.</div>}
          {qErr && !loading && <div className="notice" style={{ marginTop: 12 }}>{qErr}</div>}
          {phase.k === "failed" && <div className="notice" style={{ marginTop: 12 }}>{phase.text}</div>}
          {phase.k === "signing" && <div className="notice" style={{ marginTop: 12 }}>{phase.what}. Confirm it in your wallet.</div>}
          {phase.k === "moving" && (
            <div className="notice" style={{ marginTop: 12 }}>
              {phase.unseen
                ? "The route reports your $STOA as delivered, but Stoa does not see it at your address on Robinhood Chain yet. This page keeps checking. If it does not show up, contact Stoa with the source transaction. "
                : phase.slow ? `Your deposit was sent, but ${src.name} has not confirmed it yet. Do not buy again: this page keeps following it. ` : "Sent. Your $STOA is on its way to Robinhood Chain, to the same address. You can leave this page. "}
              <a href={`${src.chain.blockExplorers?.default.url}/tx/${phase.tx}`} target="_blank" rel="noopener noreferrer">Source tx ↗</a>
            </div>
          )}
          <button type="button" className="big pri" style={{ width: "100%", marginTop: 14 }} disabled={disabled}
            onClick={() => (!isConnected ? openWallet() : go())}>{phase.k === "signing" ? "Confirm in your wallet…" : phase.k === "moving" ? "Delivering…" : label}</button>
          <p className="note">Up to ${MAX_USD} per purchase · no Stoa fee · use a regular wallet.</p>
          <details className="note fold">
            <summary>How it works</summary>
            Routed by Trustware through Relay: you deposit on {src.name} into Relay&apos;s Depository and Relay delivers $STOA on Robinhood Chain.
            Before your wallet opens, Stoa checks the deposit goes to Relay&apos;s Depository from your own address, with exactly the token and amount you picked.
            The delivery address is set in Relay&apos;s order, which Stoa cannot check before you sign yet, so purchases are limited to ${MAX_USD} for now.
            Use a regular wallet: a smart wallet, even one not deployed yet on {src.name}, may not control the same address on Robinhood Chain.
            Stoa adds no fee of its own and never holds your funds: the fees shown are the route's (Relay and Trustware).
          </details>
        </>
      )}
    </div>
  );
}

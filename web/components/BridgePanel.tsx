"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useBalance, usePublicClient, useReadContract, useSendTransaction, useSwitchChain, useWriteContract } from "wagmi";
import { BaseError, erc20Abi, parseUnits, zeroAddress, type Hash } from "viem";
import { ALLOWED_BRIDGES, DESTS, DST_CHAIN_ID, LIFI, LIFI_DIAMOND, NATIVE_ZERO, SOURCES, USDT_MAINNET, checkLifiTx, sameAddr, type LifiQuote } from "@/lib/bridge";
import { fmt } from "@/lib/swap";
import { useWalletModal } from "./Providers";

type Phase =
  | { k: "idle" }
  | { k: "signing"; what: string }
  | { k: "moving"; tx: Hash; tool: string; since: number; explorer: string | null }
  | { k: "done"; explorer: string | null; note?: string }
  | { k: "failed"; text: string };

function explain(e: unknown): string {
  if (e instanceof BaseError) {
    if (/User rejected|denied/i.test(e.shortMessage)) return "You rejected the request in your wallet.";
    if (/insufficient funds/i.test(e.shortMessage)) return "Not enough for this and the gas on the source chain.";
    return e.shortMessage;
  }
  return (e as Error)?.message ?? "Something went wrong.";
}

const usd = (v?: number) => (v !== undefined && v > 0 ? `$${v.toFixed(v < 1 ? 3 : 2)}` : null);
const secs = (s?: number) => (!s ? "a few minutes" : s < 90 ? "about a minute" : `about ${Math.round(s / 60)} minutes`);
const QUOTE_TTL = 45_000;
/** a fresh quote at signing time may differ from the one on screen by at most this much (0.5%) */
const REQUOTE_TOLERANCE_BPS = 50n;
/** what MAX leaves for gas: more on Ethereum, where gas can spike */
const gasReserve = (chainId: number) => (chainId === 1 ? 10n ** 16n : 3n * 10n ** 15n);

/** Bridge in: from Base, Arbitrum, Ethereum, Optimism or BNB Chain to Robinhood Chain through LI.FI, signed in the
 *  user's own wallet, then straight on to Trade. */
export default function BridgePanel() {
  const { address, isConnected, chainId } = useAccount();
  const { open: openWallet } = useWalletModal();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const [srcKey, setSrcKey] = useState(SOURCES[0].key);
  const src = SOURCES.find((s) => s.key === srcKey) ?? SOURCES[0];
  const [sTokAddr, setSTokAddr] = useState(src.tokens[0].address);
  const sTok = src.tokens.find((t) => sameAddr(t.address, sTokAddr)) ?? src.tokens[0];
  const [dTokAddr, setDTokAddr] = useState(DESTS[0].address);
  const dTok = DESTS.find((t) => sameAddr(t.address, dTokAddr)) ?? DESTS[0];
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<(LifiQuote & { at: number }) | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const busy = phase.k === "signing" || phase.k === "moving";
  const pub = usePublicClient({ chainId: src.chain.id });

  const native = sameAddr(sTok.address, NATIVE_ZERO);
  const nBal = useBalance({ address, chainId: src.chain.id, query: { enabled: !!address && native } });
  const tBal = useReadContract({ address: sTok.address, abi: erc20Abi, functionName: "balanceOf", args: [address ?? zeroAddress], chainId: src.chain.id, query: { enabled: !!address && !native } });
  const bal = native ? nBal.data?.value : (tBal.data as bigint | undefined);

  const amt = useMemo(() => { try { return amount && Number(amount) > 0 ? parseUnits(amount, sTok.decimals) : undefined; } catch { return undefined; } }, [amount, sTok.decimals]);
  const tooMuch = amt !== undefined && bal !== undefined && amt > bal;

  async function fetchQuote(): Promise<LifiQuote & { at: number }> {
    const q = new URLSearchParams({
      fromChain: String(src.chain.id), toChain: String(DST_CHAIN_ID), fromToken: sTok.address, toToken: dTok.address,
      fromAmount: amt!.toString(), fromAddress: address!, toAddress: address!, integrator: "stoa", slippage: "0.005",
      allowBridges: ALLOWED_BRIDGES,
    });
    const r = await fetch(`${LIFI}/quote?${q}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.estimate || !j.transactionRequest) throw new Error(r.status === 429 ? "Too many quotes right now. Wait a few seconds." : "No route for this amount right now. Try a larger amount or another token.");
    // a route Stoa cannot check end to end is never shown
    const why = checkLifiTx(j.transactionRequest, { user: address!, chainId: src.chain.id, token: sTok.address, amount: amt!, toToken: dTok.address, minOut: BigInt(j.estimate.toAmountMin ?? 0) });
    if (why) throw new Error(dTok.symbol === "USDG" ? "No direct route to USDG for this one. Bridge ETH instead, then swap it on Stoa." : "No route Stoa can check for this amount right now. Try another token or amount.");
    return { ...(j as LifiQuote), at: Date.now() };
  }

  // a fresh quote 600 ms after the inputs settle; an older answer never overwrites a newer one
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
    }, 600);
    return () => clearTimeout(t);
  }, [amt, address, src.key, sTok.address, dTok.address]); // eslint-disable-line react-hooks/exhaustive-deps

  // follow the transfer until it lands (bridges can take a while: poll for up to 45 minutes)
  useEffect(() => {
    if (phase.k !== "moving") return;
    let stop = false;
    const { tx, tool, since } = phase;
    const tick = async () => {
      if (stop) return;
      try {
        const r = await fetch(`${LIFI}/status?txHash=${tx}&fromChain=${src.chain.id}&toChain=${DST_CHAIN_ID}&bridge=${encodeURIComponent(tool)}`);
        const j = await r.json();
        if (stop) return;
        const link = typeof j.lifiExplorerLink === "string" ? j.lifiExplorerLink : null;
        if (j.status === "DONE") {
          if (j.substatus === "REFUNDED") return setPhase({ k: "failed", text: `The bridge could not complete this transfer and refunded it on ${src.name}.` });
          return setPhase({ k: "done", explorer: link, note: j.substatus === "PARTIAL" ? "The bridge delivered a different token than planned. Check your wallet on Robinhood Chain." : undefined });
        }
        if (j.status === "FAILED") return setPhase({ k: "failed", text: "The bridge reports this transfer failed. Check the explorer link; failed transfers are refunded on the source chain." });
        if (link) setPhase((p) => (p.k === "moving" ? { ...p, explorer: link } : p));
      } catch { /* try again on the next tick */ }
      if (Date.now() - since > 45 * 60_000) return setPhase({ k: "failed", text: "Still not confirmed after 45 minutes. Check the explorer before trying again." });
      setTimeout(tick, 5000);
    };
    const t = setTimeout(tick, 5000);
    return () => { stop = true; clearTimeout(t); };
  }, [phase.k === "moving" ? phase.tx : null]); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    if (!quote || !address || !amt) return;
    try {
      if (chainId !== src.chain.id) { setPhase({ k: "signing", what: `Switch your wallet to ${src.name}` }); await switchChainAsync({ chainId: src.chain.id }); }
      // the funds arrive at the same address on Robinhood Chain: a smart-contract wallet (a Safe, a smart account) may
      // not exist or not be controlled there. EIP-7702 accounts (code 0xef0100...) are still the user's own key.
      const code = await pub!.getCode({ address });
      if (code && code !== "0x" && !code.toLowerCase().startsWith("0xef0100")) {
        throw new Error("This wallet is a smart contract. Bridge in sends funds to the same address on Robinhood Chain, which a smart wallet may not control there, so it only works with a regular wallet.");
      }
      let q = quote;
      if (Date.now() - quote.at > QUOTE_TTL) {
        q = await fetchQuote();
        setQuote(q);
        // never sign numbers the user did not see: stop if the new minimum is more than 0.5% below the one on screen
        const shown = BigInt(quote.estimate.toAmountMin), now = BigInt(q.estimate.toAmountMin);
        if (now * 10_000n < shown * (10_000n - REQUOTE_TOLERANCE_BPS)) {
          setPhase({ k: "idle" });
          setQErr(`The price moved since you looked: you'd now receive at least ${fmt(now, dTok.decimals, 6)} ${dTok.symbol}. Check the new quote and tap again.`);
          return;
        }
      }
      const t = q.transactionRequest;
      // decode what the call does (receiver, refund address, chain, token, amount) and cap the value it carries
      // the relayer must deliver at least the minimum of the quote being signed (within 0.5% of the one on screen, above)
      const why = checkLifiTx(t, { user: address, chainId: src.chain.id, token: sTok.address, amount: amt, toToken: dTok.address, minOut: BigInt(q.estimate.toAmountMin) });
      if (why) throw new Error(why);
      if (!native) {
        if (!sameAddr(q.estimate.approvalAddress, LIFI_DIAMOND)) throw new Error("This route asks to approve an unknown contract. Get a new quote.");
        const allowance = await pub!.readContract({ address: sTok.address, abi: erc20Abi, functionName: "allowance", args: [address, LIFI_DIAMOND] });
        if (allowance < amt) {
          if (allowance > 0n && sameAddr(sTok.address, USDT_MAINNET)) {
            setPhase({ k: "signing", what: "Reset the USDT allowance (USDT needs this first)" });
            await pub!.waitForTransactionReceipt({ hash: await writeContractAsync({ address: sTok.address, abi: erc20Abi, functionName: "approve", args: [LIFI_DIAMOND, 0n], chainId: src.chain.id }) });
          }
          setPhase({ k: "signing", what: `Approve ${fmt(amt, sTok.decimals, 4)} ${sTok.symbol}` });
          const ah = await writeContractAsync({ address: sTok.address, abi: erc20Abi, functionName: "approve", args: [LIFI_DIAMOND, amt], chainId: src.chain.id });
          const ar = await pub!.waitForTransactionReceipt({ hash: ah });
          if (ar.status !== "success") throw new Error("The approval failed. Nothing was bridged.");
        }
      }
      setPhase({ k: "signing", what: `Send ${fmt(amt, sTok.decimals, 4)} ${sTok.symbol} to Robinhood Chain` });
      const tx = await sendTransactionAsync({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : 0n, chainId: t.chainId, gas: t.gasLimit ? BigInt(t.gasLimit) : undefined });
      const rc = await pub!.waitForTransactionReceipt({ hash: tx });
      if (rc.status !== "success") throw new Error(`The transaction failed on ${src.name}. Nothing was bridged.`);
      setPhase({ k: "moving", tx, tool: q.tool, since: Date.now(), explorer: null });
    } catch (e) { setPhase({ k: "failed", text: explain(e) }); }
  }

  const reset = () => { setPhase({ k: "idle" }); setAmount(""); setQuote(null); };
  const tradeHref = `/trade?chain=robinhood&sell=${dTok.symbol}`;
  const fees = quote ? (quote.estimate.feeCosts ?? []).reduce((a, f) => a + Number(f.amountUSD ?? 0), 0) : 0;
  const gas = quote ? (quote.estimate.gasCosts ?? []).reduce((a, g) => a + Number(g.amountUSD ?? 0), 0) : 0;

  let label = "Bridge to Robinhood Chain";
  if (!isConnected) label = "Connect wallet";
  else if (!amt) label = "Enter an amount";
  else if (tooMuch) label = `Not enough ${sTok.symbol} on ${src.name}`;
  else if (loading) label = "Finding a route…";
  else if (!quote) label = qErr ? "No route" : "Bridge to Robinhood Chain";
  else if (chainId !== src.chain.id) label = `Switch to ${src.name} and bridge`;
  const disabled = isConnected && (!quote || tooMuch || loading || busy);

  return (
    <div className="panel pad">
      {phase.k === "done" ? (
        <div>
          <div className="lbl">ARRIVED</div>
          <p style={{ fontSize: 20, margin: "8px 0 4px" }}>Your {dTok.symbol} is on Robinhood Chain.</p>
          <p className="note" style={{ marginTop: 0 }}>{phase.note ?? "Same wallet address. Next: swap it into any token or stock token."}</p>
          <Link href={tradeHref} className="big pri" style={{ display: "flex", justifyContent: "center", textDecoration: "none", marginTop: 14 }}>Swap {dTok.symbol} on Stoa</Link>
          {phase.explorer && <p className="note"><a href={phase.explorer} target="_blank" rel="noopener noreferrer">View the transfer ↗</a></p>}
          <button type="button" className="ghost" style={{ marginTop: 8 }} onClick={reset}>Bridge more</button>
        </div>
      ) : (
        <>
          <div className="lbl">FROM</div>
          <div className="seg" role="tablist" style={{ marginTop: 8, flexWrap: "wrap" }}>
            {SOURCES.map((s) => <button key={s.key} type="button" className={s.key === src.key ? "on" : undefined} disabled={busy} onClick={() => { setSrcKey(s.key); setSTokAddr(s.tokens[0].address); }}>{s.name}</button>)}
          </div>
          <div className="box" style={{ marginTop: 12 }}>
            <div className="row"><label className="lbl" htmlFor="bamt">YOU SEND</label>
              <button type="button" className="lbl" style={{ border: 0, background: "none", cursor: bal ? "pointer" : "default" }} disabled={busy}
                onClick={() => { const r = gasReserve(src.chain.id); if (bal) setAmount(fmt(native ? (bal > r ? bal - r : 0n) : bal, sTok.decimals, 8).replace(/,/g, "")); }}>
                BALANCE {bal !== undefined ? fmt(bal, sTok.decimals, 4) : "—"}
              </button></div>
            <div className="row">
              <input id="bamt" type="text" inputMode="decimal" placeholder="0.00" autoComplete="off" value={amount} readOnly={busy}
                onChange={(e) => { setPhase({ k: "idle" }); setAmount(e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "")); }} />
              <div className="seg">{src.tokens.map((t) => <button key={t.address} type="button" className={sameAddr(t.address, sTok.address) ? "on" : undefined} disabled={busy} onClick={() => setSTokAddr(t.address)}>{t.symbol}</button>)}</div>
            </div>
            {quote?.estimate.fromAmountUSD && <div className="usd">≈ {usd(Number(quote.estimate.fromAmountUSD))}</div>}
          </div>

          <div className="lbl" style={{ marginTop: 16 }}>TO ROBINHOOD CHAIN</div>
          <div className="box" style={{ marginTop: 8 }}>
            <div className="row">
              <span className="amt" style={{ fontFamily: "var(--num)", fontSize: 26 }}>{quote ? fmt(BigInt(quote.estimate.toAmount), dTok.decimals, 6) : loading ? "…" : "0.00"}</span>
              <div className="seg">{DESTS.map((t) => <button key={t.address} type="button" className={sameAddr(t.address, dTok.address) ? "on" : undefined} disabled={busy} onClick={() => setDTokAddr(t.address)}>{t.symbol}</button>)}</div>
            </div>
            {quote?.estimate.toAmountUSD && <div className="usd">≈ {usd(Number(quote.estimate.toAmountUSD))}</div>}
          </div>

          {quote && (
            <div className="det">
              <span>You receive at least</span><span>{fmt(BigInt(quote.estimate.toAmountMin), dTok.decimals, 6)} {dTok.symbol}</span>
              <span>Fees</span><span>{usd(fees) ?? "none"}{gas > 0 ? ` + gas ${usd(gas)}` : ""}</span>
              <span>Arrives in</span><span>{secs(quote.estimate.executionDuration)}</span>
              <span>Bridge</span><span>{quote.toolDetails?.name ?? quote.tool} via LI.FI</span>
            </div>
          )}
          {qErr && !loading && <div className="notice" style={{ marginTop: 12 }}>{qErr}</div>}
          {phase.k === "failed" && <div className="notice" style={{ marginTop: 12 }}>{phase.text}</div>}
          {phase.k === "signing" && <div className="notice" style={{ marginTop: 12 }}>{phase.what}. Confirm it in your wallet.</div>}
          {phase.k === "moving" && (
            <div className="notice" style={{ marginTop: 12 }}>
              Sent. Your funds are on their way to Robinhood Chain. You can leave this page; they arrive in the same address.{" "}
              <a href={`${src.chain.blockExplorers?.default.url}/tx/${phase.tx}`} target="_blank" rel="noopener noreferrer">Source tx ↗</a>
              {phase.explorer && <> · <a href={phase.explorer} target="_blank" rel="noopener noreferrer">Track it ↗</a></>}
            </div>
          )}

          <button type="button" className="big pri" style={{ width: "100%", marginTop: 14 }} disabled={disabled}
            onClick={() => (!isConnected ? openWallet() : go())}>{phase.k === "signing" ? "Confirm in your wallet…" : phase.k === "moving" ? "Bridging…" : label}</button>
          <p className="note">No Stoa fee · arrives in the same wallet.</p>
          <details className="note fold"><summary>How it works</summary>Routes by LI.FI over Across. Before your wallet opens, Stoa decodes each transaction and checks it sends exactly what you picked, to your own address on Robinhood Chain. Stoa adds no fee and never holds your funds: you sign in your own wallet, and the funds arrive in the same address on Robinhood Chain.</details>
        </>
      )}
    </div>
  );
}

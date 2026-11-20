"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { useChainWrite } from "@/lib/chainWrite";
import { BaseError, ContractFunctionRevertedError, erc20Abi, parseUnits, zeroAddress, type Address, type Hash } from "viem";
import { txUrlOn, type Net } from "@/lib/networks";
import { isNative, type Token } from "@/lib/tokens";
import { routerAbi } from "@/lib/abi";
import { fmt, fmtAmt, rate } from "@/lib/swap";
import { CANCELLED, FILLED, LIMIT, LIMIT_ERRORS, OPEN, limitAbi, type Order } from "@/lib/limit";

const EXPIRY = [{ label: "1 day", s: 86_400 }, { label: "7 days", s: 7 * 86_400 }, { label: "30 days", s: 30 * 86_400 }];

function explain(e: unknown): string {
  if (e instanceof BaseError) {
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError);
    const n = rev instanceof ContractFunctionRevertedError ? rev.data?.errorName : undefined;
    if (n && LIMIT_ERRORS[n]) return LIMIT_ERRORS[n];
    if (/User rejected|denied/i.test(e.shortMessage)) return "You rejected the request in your wallet.";
    if (/insufficient funds/i.test(e.shortMessage)) return "Not enough ETH for this and gas.";
    return e.shortMessage;
  }
  return (e as Error)?.message ?? "Something went wrong.";
}

/** The Limit tab on Trade (Robinhood Chain): sell the amount above for at least a price you set. The deposit sits in
 *  the StoaLimit contract until Stoa's keeper fills it through the router or you cancel. */
export default function LimitPanel({ net, sell, buy, amt, marketOut, sBal, referrer, tokens, warning, gate, startPct = 0 }: {
  net: Net; sell: Token; buy: Token; amt?: bigint; marketOut?: bigint; sBal?: bigint; referrer?: Address; tokens: Token[];
  /** where the price starts, in % above the market rate (more of `buy` per `sell`): a "buy the dip" link sets it */
  startPct?: number;
  /** the unverified-token notice from Trade, and the label to show until it is confirmed */
  warning?: ReactNode; gate?: string;
}) {
  const { address, isConnected, chainId } = useAccount();
  const pub = usePublicClient({ chainId: net.chain.id });
  const { writeContractAsync } = useChainWrite();
  const [priceTxt, setPriceTxt] = useState("");
  const [touched, setTouched] = useState(false);
  const [exp, setExp] = useState(EXPIRY[1].s);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: Hash } | null>(null);

  const market = amt && marketOut ? rate(amt, sell.decimals, marketOut, buy.decimals) : 0;
  // a new pair starts again from its market price (adjusted during render, so it cannot undo the fill below)
  const pair = `${sell.address}-${buy.address}`;
  const [forPair, setForPair] = useState(pair);
  if (forPair !== pair) { setForPair(pair); setTouched(false); setPriceTxt(""); }
  // start from the market price; the user moves it
  useEffect(() => { if (!touched && market > 0) setPriceTxt(String(Number((market * (1 + startPct / 100)).toPrecision(6)))); }, [market, touched, pair, startPct]);
  const price = Number(priceTxt);
  const minOut = useMemo(() => {
    if (!amt || !(price > 0)) return undefined;
    try {
      const human = (Number(amt) / 10 ** sell.decimals) * price;
      return parseUnits(human.toFixed(Math.min(buy.decimals, 12)), buy.decimals);
    } catch { return undefined; }
  }, [amt, price, sell.decimals, buy.decimals]);
  const diff = market > 0 && price > 0 ? (price / market - 1) * 100 : null;

  const allowance = useReadContract({
    address: sell.address, abi: erc20Abi, functionName: "allowance", args: [address ?? zeroAddress, LIMIT ?? zeroAddress],
    chainId: net.chain.id, query: { enabled: !!address && !isNative(sell) && !!LIMIT },
  });
  const needApprove = !isNative(sell) && !!amt && ((allowance.data as bigint | undefined) ?? 0n) < amt;
  const orders = useOrders(address, net);

  async function send(label: string, fn: () => Promise<Hash>) {
    if (!pub) return;
    setBusy(label); setMsg(null);
    try {
      const hash = await fn();
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("Transaction reverted");
      setMsg({ ok: true, text: `${label}: confirmed`, hash });
      void allowance.refetch(); void orders.refetch();
    } catch (e) { setMsg({ ok: false, text: explain(e) }); } finally { setBusy(null); }
  }

  const wrongChain = isConnected && chainId !== net.chain.id;
  let label = "Place limit order", disabled = !!busy;
  if (!isConnected) { label = "Connect a wallet"; disabled = true; }
  else if (wrongChain) { label = `Switch to ${net.name}`; disabled = true; }
  else if (!amt) { label = "Enter an amount"; disabled = true; }
  else if (sell.address.toLowerCase() === buy.address.toLowerCase() || (isNative(sell) && buy.address.toLowerCase() === net.wrapped.toLowerCase()) || (isNative(buy) && sell.address.toLowerCase() === net.wrapped.toLowerCase())) { label = "Pick two different tokens"; disabled = true; }
  else if (!minOut || minOut === 0n) { label = "Set a price"; disabled = true; }
  else if (sBal !== undefined && amt > sBal) { label = `Not enough ${sell.symbol}`; disabled = true; }
  else if (gate) { label = gate; disabled = true; }
  else if (needApprove) label = `Approve ${sell.symbol}`;
  if (busy) label = `${busy}…`;

  const place = () => {
    if (!amt || !minOut || !LIMIT) return;
    if (needApprove) return send(`Approve ${sell.symbol}`, () => writeContractAsync({ address: sell.address, abi: erc20Abi, functionName: "approve", args: [LIMIT!, amt], chainId: net.chain.id }));
    return send("Limit order", async () => {
      // from the chain's clock, not this device's, a little short so "30 days" stays inside the contract's maximum
      const now = (await pub!.getBlock()).timestamp;
      return writeContractAsync({
      address: LIMIT!, abi: limitAbi, functionName: "create",
      args: [sell.address, buy.address, amt, minOut, now + BigInt(exp - 300), referrer ?? zeroAddress],
      value: isNative(sell) ? amt : 0n, chainId: net.chain.id,
      });
    });
  };

  return (
    <>
      <div className="box" style={{ marginTop: 10 }}>
        <div className="row"><label className="lbl" htmlFor="limitp">LIMIT PRICE</label>
          {market > 0 && <button type="button" className="lbl" style={{ border: 0, background: "none", cursor: "pointer" }} onClick={() => { setTouched(false); setPriceTxt(String(Number(market.toPrecision(6)))); }}>MARKET {Number(market.toPrecision(6)).toLocaleString("en-US", { maximumSignificantDigits: 6 })}</button>}</div>
        <div className="row">
          <input id="limitp" type="text" inputMode="decimal" placeholder="0.00" autoComplete="off" value={priceTxt}
            onChange={(e) => { setTouched(true); setPriceTxt(e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "")); }} />
          <span className="lbl" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{buy.symbol} per {sell.symbol}</span>
        </div>
        <div className="seg" style={{ marginTop: 8 }}>
          {[0, 2, 5, 10].map((p) => <button key={p} type="button" className={touched && diff !== null && Math.abs(diff - p) < 0.05 ? "on" : undefined}
            onClick={() => { if (market > 0) { setTouched(true); setPriceTxt(String(Number((market * (1 + p / 100)).toPrecision(6)))); } }}>{p === 0 ? "Market" : `+${p}%`}</button>)}
        </div>
      </div>
      <div className="det">
        <span>You receive at least</span><span>{minOut ? `${fmtAmt(minOut, buy.decimals)} ${buy.symbol}` : "—"}</span>
        <span>Versus the market now</span><span style={{ color: diff !== null && diff < -0.5 ? "#B4442E" : undefined }}>{diff === null ? "—" : Math.abs(diff) < 0.005 ? "0.00%" : `${diff > 0 ? "+" : ""}${diff.toFixed(2)}%`}</span>
        <span>Expires</span><span><span className="seg" style={{ display: "inline-flex" }}>{EXPIRY.map((x) => <button key={x.s} type="button" className={x.s === exp ? "on" : undefined} onClick={() => setExp(x.s)}>{x.label}</button>)}</span></span>
      </div>
      {diff !== null && diff < -0.5 && <div className="notice" style={{ marginTop: 12, marginBottom: 0 }}>This price is below what the market pays right now. A normal swap gets you more.</div>}
      {warning}
      <button className="big pri" type="button" disabled={disabled} onClick={place}>{label}</button>
      {msg && <div className={msg.ok ? "ok" : "err"}>{msg.text}{msg.hash && <> · <a href={txUrlOn(net, msg.hash)} target="_blank" rel="noopener noreferrer">View</a></>}</div>}
      <p className="note">Your {sell.symbol} waits in Stoa&apos;s limit order contract. When the market pays your price, Stoa&apos;s keeper swaps it through the router, about every 5 minutes, and the router pays you directly; it can never pay you less than your minimum. Cancel any time to take it back. Same 2 bps fee as a swap.</p>
      <OrderList net={net} orders={orders} tokens={tokens} send={send} busy={busy} />
    </>
  );
}

type Row = { id: bigint; o: Order };
function useOrders(address: Address | undefined, net: Net) {
  const ids = useReadContract({ address: LIMIT, abi: limitAbi, functionName: "ordersOf", args: [address ?? zeroAddress], chainId: net.chain.id, query: { enabled: !!address && !!LIMIT, refetchInterval: 20_000 } });
  const list = ((ids.data as bigint[] | undefined) ?? []).slice(-12).reverse();
  const rows = useReadContracts({ contracts: list.map((id) => ({ address: LIMIT!, abi: limitAbi, functionName: "order" as const, args: [id] as const, chainId: net.chain.id })), query: { enabled: list.length > 0, refetchInterval: 20_000 } });
  const data: Row[] = list.map((id, i) => ({ id, o: rows.data?.[i]?.result as unknown as Order })).filter((r) => !!r.o);
  return { data, refetch: async () => { await ids.refetch(); await rows.refetch(); } };
}

function OrderList({ net, orders, tokens, send, busy }: { net: Net; orders: ReturnType<typeof useOrders>; tokens: Token[]; send: (l: string, f: () => Promise<Hash>) => Promise<void>; busy: string | null }) {
  const { writeContractAsync } = useChainWrite();
  const pub = usePublicClient({ chainId: net.chain.id });
  const tok = (a: Address) => tokens.find((t) => t.address.toLowerCase() === a.toLowerCase());
  const syms = useReadContracts({
    contracts: [...new Set(orders.data.flatMap((r) => [r.o.tokenIn, r.o.tokenOut]).filter((a) => a !== zeroAddress && !tok(a)))].flatMap((a) => [
      { address: a, abi: erc20Abi, functionName: "symbol" as const, chainId: net.chain.id },
      { address: a, abi: erc20Abi, functionName: "decimals" as const, chainId: net.chain.id },
    ]),
    query: { enabled: orders.data.length > 0 },
  });
  const extra = [...new Set(orders.data.flatMap((r) => [r.o.tokenIn, r.o.tokenOut]).filter((a) => a !== zeroAddress && !tok(a)))];
  const info = (a: Address) => {
    if (a === zeroAddress) return { symbol: net.gas, decimals: 18 };
    const t = tok(a); if (t) return { symbol: t.symbol, decimals: t.decimals };
    const i = extra.indexOf(a);
    return { symbol: String(syms.data?.[i * 2]?.result ?? "TOKEN").replace(/[^\w.$-]/g, "").slice(0, 12), decimals: Number(syms.data?.[i * 2 + 1]?.result ?? 18) };
  };
  if (!orders.data.length) return null;
  const now = Date.now() / 1000;
  const fillNow = async (r: Row) => {
    const q = await pub!.simulateContract({ address: net.contracts.router!, abi: routerAbi, functionName: "quote", args: [r.o.tokenIn, r.o.tokenOut, r.o.amountIn] });
    const route = q.result as { amountOut: bigint; mid: Address; leg1: { venue: Address; isPool: boolean }; leg2: { venue: Address; isPool: boolean } };
    if (route.amountOut < r.o.minOut) throw new Error(`The market pays ${fmtAmt(route.amountOut, info(r.o.tokenOut).decimals)} ${info(r.o.tokenOut).symbol} now, below your minimum. Your order stays open.`);
    return writeContractAsync({ address: LIMIT!, abi: limitAbi, functionName: "fill", args: [r.id, route.mid, route.leg1, route.leg2], chainId: net.chain.id });
  };
  return (
    <div style={{ marginTop: 16 }}>
      <div className="lbl">YOUR LIMIT ORDERS</div>
      <ul className="list">
        {orders.data.map((r) => {
          const a = info(r.o.tokenIn), b = info(r.o.tokenOut);
          const open = r.o.status === OPEN, expired = open && Number(r.o.expiry) < now;
          return (
            <li key={r.id.toString()} style={{ flexWrap: "wrap", gap: 6 }}>
              <span>{fmt(r.o.amountIn, a.decimals, 6)} {a.symbol} → ≥ {fmt(r.o.minOut, b.decimals, 6)} {b.symbol}</span>
              {open ? (
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="note" style={{ marginTop: 0 }}>{expired ? "expired" : `open · ${Math.max(1, Math.round((Number(r.o.expiry) - now) / 3600))}h left`}</span>
                  {!expired && <button type="button" className="ghost" disabled={!!busy} onClick={() => send("Fill now", () => fillNow(r))}>Fill now</button>}
                  <button type="button" className="ghost" disabled={!!busy} onClick={() => send("Cancel", () => writeContractAsync({ address: LIMIT!, abi: limitAbi, functionName: "cancel", args: [r.id], chainId: net.chain.id }))}>Cancel</button>
                </span>
              ) : <b>{r.o.status === FILLED ? "Filled" : r.o.status === CANCELLED ? "Cancelled" : "—"}</b>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

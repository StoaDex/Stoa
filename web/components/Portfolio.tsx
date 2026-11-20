"use client";
import { useAccount, useBalance, useReadContracts } from "wagmi";
import { erc20Abi } from "viem";
import Link from "next/link";
import { isNative } from "@/lib/tokens";
import { feesAbi } from "@/lib/abi";
import { fmt } from "@/lib/swap";
import { useNet, useWalletModal } from "./Providers";
import { TokenIcon } from "./ui";
import SwapHistory from "./SwapHistory";
import PnlPanel from "./PnlPanel";
import StockHoldings from "./StockHoldings";

export default function Portfolio() {
  const net = useNet();
  const elysium = net.chain, CONTRACTS = net.contracts;
  // core tokens always, plus the verified bridged tokens on Elysium (shown when held)
  const ALL = net.tokens.filter((t, i) => i < net.core || t.tone === "bridged");
  const CORE = new Set(net.tokens.slice(0, net.core).map((t) => t.address));
  const { address, isConnected } = useAccount();
  const { open } = useWalletModal();
  const native = useBalance({ address, chainId: elysium.id, query: { enabled: !!address } });
  const erc = ALL.filter((t) => !isNative(t));
  const bals = useReadContracts({ contracts: erc.map((t) => ({ address: t.address, abi: erc20Abi, functionName: "balanceOf" as const, args: [address!] as const, chainId: elysium.id })), query: { enabled: !!address } });
  const refs = useReadContracts({ contracts: erc.map((t) => ({ address: CONTRACTS.fees!, abi: feesAbi, functionName: "referralOwed" as const, args: [address!, t.address] as const, chainId: elysium.id })), query: { enabled: !!address && !!CONTRACTS.fees } });

  if (!isConnected) {
    return <div className="panel empty"><img src="/logo.png" alt="" style={{ width: 64, height: 64 }} /><h3>Nothing here yet</h3><p>Connect a wallet to see your balances and positions on Stoa.</p><button className="cta" type="button" onClick={open}>Connect wallet</button></div>;
  }
  const bal = (i: number) => (bals.data?.[i]?.result as bigint | undefined);
  return (
    <div className="grid2 eq">
      <div className="panel" style={{ overflow: "hidden" }}>
        <table className="tbl"><thead><tr><th>TOKEN · {net.short.toUpperCase()}</th><th style={{ textAlign: "right" }}>BALANCE</th></tr></thead>
          <tbody>
            {ALL.map((t) => {
              const v = isNative(t) ? native.data?.value : bal(erc.indexOf(t));
              if (!CORE.has(t.address) && !v) return null; // verified tokens show only when held
              return <tr key={t.symbol}><td><span className="pair"><TokenIcon t={t} />{t.symbol}</span></td><td style={{ textAlign: "right", fontFamily: "var(--num)" }}>{v !== undefined ? fmt(v, t.decimals, 6) : "—"}</td></tr>;
            })}
          </tbody></table>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="panel pad"><div className="lbl">REFERRAL EARNINGS</div>
          <ul className="list">{erc.map((t, i) => (!CORE.has(t.address) && !(refs.data?.[i]?.result as bigint | undefined)) ? null : <li key={t.symbol}>{t.symbol} <b>{CONTRACTS.fees ? fmt((refs.data?.[i]?.result as bigint | undefined) ?? 0n, t.decimals, 6) : "—"}</b></li>)}</ul>
          <Link className="go" href="/referrals">Referrals</Link></div>
        <div className="panel pad"><div className="lbl">VAULT SHARES</div><p className="note">Pool vaults are not open yet. <a href="/earn">Earn ETH with $STOA</a> in Spotlight today.</p></div>
      </div>
      {address && net.key === "robinhood" && <StockHoldings address={address} />}
      {address && net.contracts.router && net.deployed && <PnlPanel net={net} address={address} />}
      <div className="panel pad" style={{ gridColumn: "1 / -1", overflowX: "auto" }}><div className="lbl" style={{ marginBottom: 12 }}>YOUR SWAPS</div><SwapHistory /></div>
    </div>
  );
}

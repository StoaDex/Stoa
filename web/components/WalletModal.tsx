"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, useBalance } from "wagmi";
import { WC_ENABLED, ensureWalletConnect } from "@/lib/wagmi";
import { txUrl } from "@/lib/chain";
import { NETS } from "@/lib/networks";
import { useNet, useSetNet } from "./Providers";
import { fmt } from "@/lib/swap";

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export default function WalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { address, chainId, isConnected, connector } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const net = useNet(), setNet = useSetNet();
  const elysium = net.chain;
  const { data: bal } = useBalance({ address, chainId: elysium.id, query: { enabled: !!address } });
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mobile, setMobile] = useState(false);
  const [hasEth, setHasEth] = useState(false);
  const [here, setHere] = useState("https://stoadex.com/trade");
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open, onClose]);

  useEffect(() => { if (isConnected && open && chainId === elysium.id && !error) { /* stay open to show account */ } }, [isConnected, open, chainId, error]);

  useEffect(() => {
    if (!open) return;
    setMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
    setHasEth(typeof window !== "undefined" && !!(window as unknown as { ethereum?: unknown }).ethereum);
    setHere(location.href.split("#")[0]);
  }, [open]);
  useEffect(() => { if (!isPending) setPending(null); }, [isPending]);

  if (!open) return null;
  // EIP-6963 wallets announce themselves with their own name and logo; the generic
  // "injected" entry is shown only when a provider exists but announced nothing
  const named = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  const generic = connectors.find((c) => c.id === "injected");
  const installed = named.length ? named : hasEth && generic ? [generic] : [];
  const wcConn = connectors.find((c) => c.type === "walletConnect");
  const wcShown = WC_ENABLED || !!wcConn; // the connector itself loads on the first tap (lib/wagmi.ts)
  const go = (c: (typeof connectors)[number]) => { setPending(c.uid); if (c.type === "walletConnect") onClose(); connect({ connector: c, chainId: elysium.id }); };
  const wrongChain = isConnected && chainId !== elysium.id;

  return (
    <div className="modal open" role="dialog" aria-modal="true" aria-labelledby="wmt" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel">
        <div className="rowx">
          <h2 id="wmt" style={{ margin: 0, fontFamily: "var(--serif)", fontWeight: 400, fontSize: 24, color: "var(--ink)" }}>
            {isConnected ? "Your wallet" : "Connect a wallet"}
          </h2>
          <button ref={closeRef} className="x" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        {isConnected ? (
          <div className="acct">
            <div className="box">
              <div className="row"><span className="lbl">ACCOUNT</span><span className="lbl">{connector?.name}</span></div>
              <div className="row"><span className="addrchip">{short(address)}</span>
                <button className="cp" type="button" onClick={async () => { try { await navigator.clipboard.writeText(address!); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}>{copied ? "Copied" : "Copy"}</button></div>
              <div className="row"><span className="lbl">BALANCE</span><span className="addrchip">{bal ? `${fmt(bal.value, 18, 4)} ${net.gas}` : "—"}</span></div>
            </div>
            <div className="box">
              <div className="row"><span className="lbl">NETWORK</span></div>
              <div className="seg netseg">{NETS.map((n) => <button key={n.key} type="button" className={n.key === net.key && !wrongChain ? "on" : undefined} onClick={() => (n.key === net.key ? switchChain({ chainId: n.chain.id }) : setNet(n))}><img className="netlogo" src={n.logo} alt="" width={18} height={18} />{n.short}</button>)}</div>
            </div>
            {wrongChain && <button className="big pri" type="button" onClick={() => switchChain({ chainId: elysium.id })}>Switch to {elysium.name}</button>}
            <button className="ghost" style={{ borderColor: "var(--line)", background: "#fff", justifyContent: "center" }} type="button" onClick={() => { disconnect(); onClose(); }}>Disconnect</button>
          </div>
        ) : (
          <>
            <p className="wsub">Pick a wallet to start trading on {net.name}.</p>
            {installed.length > 0 && (
              <>
                <div className="wh">INSTALLED</div>
                <div className="wl">
                  {installed.map((c) => (
                    <Row key={c.uid} icon={c.icon || "/wallets/browser.svg"} name={c.id === "injected" ? "Browser wallet" : c.name}
                      sub={pending === c.uid ? "Confirm in your wallet…" : "Detected on this device"} tag="Ready"
                      busy={pending === c.uid} disabled={isPending} onClick={() => go(c)} />
                  ))}
                </div>
              </>
            )}
            {mobile && installed.length === 0 && (
              <>
                <div className="wh">OPEN STOA IN YOUR WALLET APP</div>
                <div className="wl">
                  <Row href={`https://metamask.app.link/dapp/${here.replace(/^https?:\/\//, "")}`} icon="/wallets/metamask.svg" name="MetaMask" sub="Opens Stoa inside the app" />
                  <Row href={`https://web3.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(here)}`)}`} icon="/wallets/okx.svg" name="OKX Wallet" sub="Opens Stoa inside the app" />
                </div>
              </>
            )}
            {wcShown && (
              <>
                <div className="wh">{installed.length || mobile ? "OTHER WALLETS" : "USE YOUR PHONE"}</div>
                <div className="wl">
                  <Row icon="/wallets/wallet-connect.svg" name="WalletConnect" sub={wcConn && pending === wcConn.uid ? "Waiting for approval…" : mobile ? "Rabby, Trust and 300+ more" : "Scan a QR with your phone wallet"}
                    busy={!!wcConn && pending === wcConn.uid} disabled={isPending} onClick={() => { const c = wcConn ?? ensureWalletConnect(); if (c) go(c); }} />
                </div>
              </>
            )}
            {!mobile && installed.length === 0 && (
              <>
                <div className="wh">NO WALLET YET?</div>
                <div className="wl">
                  <Row href="https://rabby.io" icon="/wallets/rabby.svg" name="Rabby" sub="Install the browser extension" />
                  <Row href="https://metamask.io/download/" icon="/wallets/metamask.svg" name="MetaMask" sub="Install the browser extension" />
                </div>
              </>
            )}
            {error && <div className="err">{/rejected|denied/i.test(error.message) ? "Request cancelled in the wallet." : error.message.split("\n")[0]}</div>}
            <p className="note wfoot">Your wallet adds the {elysium.name} network (chain {elysium.id}) on first connect. Stoa never holds your funds.</p>
          </>
        )}
      </div>
    </div>
  );
}
function Row({ icon, name, sub, tag, href, busy, disabled, onClick }: {
  icon: string; name: string; sub: string; tag?: string; href?: string; busy?: boolean; disabled?: boolean; onClick?: () => void;
}) {
  const inner = (
    <>
      <img src={icon} alt="" width={36} height={36} />
      <span className="wn"><b>{name}</b><small>{sub}</small></span>
      {busy ? <span className="wspin" aria-label="Connecting" /> : tag ? <span className="wtag">{tag}</span> : <span className="wgo" aria-hidden>›</span>}
    </>
  );
  return href
    ? <a className="wrow" href={href} target="_blank" rel="noopener noreferrer">{inner}</a>
    : <button className="wrow" type="button" disabled={disabled} onClick={onClick}>{inner}</button>;
}
export { txUrl };

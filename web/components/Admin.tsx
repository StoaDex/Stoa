"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { useChainWrite } from "@/lib/chainWrite";
import { BaseError, encodeAbiParameters, encodeFunctionData, isAddress, keccak256, zeroAddress, type Address, type Hash, type Hex } from "viem";
import { addressUrlOn, txUrlOn } from "@/lib/networks";
import { adminAbi } from "@/lib/abi";
import { fmt } from "@/lib/swap";
import { useNet, useWalletModal } from "./Providers";
import { approvedSignatures, batch, safeAbi, timelockAbi } from "@/lib/safe";
import { executeCall, opId, routerGovAbi, scheduleCalls, timelockBatchAbi, venueOps } from "@/lib/venuePackage";

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Owner and guardian console. The contracts enforce every permission; this page only sends the calls. */
export default function Admin() {
  const net = useNet();
  const elysium = net.chain, CONTRACTS = net.contracts, VENUE_NAMES = net.venues, WHYPE = net.wrapped, USDC = net.stable;
  const WS = net.tokens[1].symbol, US = net.tokens[2].symbol, UD = net.tokens[2].decimals;
  const txUrl = (h: string) => txUrlOn(net, h), addressUrl = (a: string) => addressUrlOn(net, a);
  const { address, isConnected } = useAccount();
  const { open } = useWalletModal();
  const pub = usePublicClient({ chainId: elysium.id });
  const { writeContractAsync } = useChainWrite();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: Hash } | null>(null);
  const [venue, setVenue] = useState("");
  const [venueIsPool, setVenueIsPool] = useState(false);
  const [maker, setMaker] = useState("");
  const [to, setTo] = useState("");

  const R = CONTRACTS.router, F = CONTRACTS.fees, G = CONTRACTS.registry, P = CONTRACTS.pool, V = CONTRACTS.v4, S = CONTRACTS.safe, T = CONTRACTS.timelock;
  const owned = [
    ["StoaRouter", R], ["MakerRegistry", G], ["FeeDistributor", F], ["StoaPool (WHYPE/USDC)", P], ["UniswapV4Adapter", V],
  ].filter(([, a]) => a) as [string, Address][];

  const reads = useReadContracts({
    contracts: [
      ...owned.flatMap(([, a]) => [
        { address: a, abi: adminAbi, functionName: "owner" as const, chainId: elysium.id },
        { address: a, abi: adminAbi, functionName: "pendingOwner" as const, chainId: elysium.id },
      ]),
      { address: R!, abi: adminAbi, functionName: "guardian" as const, chainId: elysium.id },
      { address: R!, abi: adminAbi, functionName: "paused" as const, chainId: elysium.id },
      { address: R!, abi: adminAbi, functionName: "setupLocked" as const, chainId: elysium.id },
      { address: R!, abi: adminAbi, functionName: "delay" as const, chainId: elysium.id },
      { address: F!, abi: adminAbi, functionName: "protocolAccrued" as const, args: [WHYPE], chainId: elysium.id },
      { address: F!, abi: adminAbi, functionName: "protocolAccrued" as const, args: [USDC], chainId: elysium.id },
      // no maker pool on some networks: the slot then reads the router again and is ignored
      { address: (P ?? R)!, abi: adminAbi, functionName: "paused" as const, chainId: elysium.id },
      ...(S ? [
        { address: S, abi: safeAbi, functionName: "getOwners" as const, chainId: elysium.id },
        { address: S, abi: safeAbi, functionName: "getThreshold" as const, chainId: elysium.id },
      ] : []),
    ],
    query: { enabled: !!R && !!F, refetchInterval: 15_000 },
  });
  // new venue adapters (Robinhood Chain: Aero, Ramses): status of the three timelock rounds that add them
  const nv = net.newVenues;
  const ops = R && nv.length ? venueOps(R, nv.map((v) => v.address)) : null;
  const firstPid = nv.length ? keccak256(encodeAbiParameters([{ type: "bool" }, { type: "address" }], [false, nv[0].address])) : undefined;
  const roll = useReadContracts({
    contracts: [
      ...nv.map((v) => ({ address: R!, abi: routerGovAbi, functionName: "isAdapter" as const, args: [v.address] as const, chainId: elysium.id })),
      { address: T!, abi: timelockBatchAbi, functionName: "getMinDelay" as const, chainId: elysium.id },
      { address: R!, abi: routerGovAbi, functionName: "delay" as const, chainId: elysium.id },
      { address: T!, abi: timelockBatchAbi, functionName: "getTimestamp" as const, args: [ops ? opId(ops.a) : "0x"] as const, chainId: elysium.id },
      { address: T!, abi: timelockBatchAbi, functionName: "getTimestamp" as const, args: [ops ? opId(ops.b) : "0x"] as const, chainId: elysium.id },
      { address: R!, abi: routerGovAbi, functionName: "pending" as const, args: [firstPid ?? "0x"] as const, chainId: elysium.id },
    ],
    query: { enabled: !!R && !!T && !!ops, refetchInterval: 15_000 },
  });
  const r = (i: number) => reads.data?.[i]?.result;
  const n = owned.length * 2;
  const guardian = r(n) as Address | undefined, paused = r(n + 1) as boolean | undefined;
  const locked = r(n + 2) as boolean | undefined, delay = r(n + 3) as bigint | undefined;
  const accW = (r(n + 4) as bigint | undefined) ?? 0n, accU = (r(n + 5) as bigint | undefined) ?? 0n;
  const poolPaused = P ? (r(n + 6) as boolean | undefined) : undefined;
  const routerOwner = r(0) as Address | undefined;
  const safeOwners = (S ? (r(n + 7) as Address[] | undefined) : undefined) ?? [];
  const threshold = S ? (r(n + 8) as bigint | undefined) : undefined;
  const isSigner = safeOwners.some((o) => same(o, address));
  const ownerOf = (a: Address) => { const i = owned.findIndex(([, x]) => same(x, a)); return i < 0 ? undefined : (r(2 * i) as Address | undefined); };
  const pendingOf = (i: number) => r(2 * i + 1) as Address | undefined;
  const isOwner = same(address, routerOwner) || (same(routerOwner, S) && isSigner), isGuardian = same(address, guardian);

  async function send(label: string, fn: () => Promise<Hash>) {
    if (!pub) return;
    setBusy(label); setMsg(null);
    try {
      const hash = await fn();
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("Transaction reverted");
      setMsg({ ok: true, text: `${label}: confirmed`, hash });
      void reads.refetch();
      void roll.refetch();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof BaseError ? e.shortMessage : (e as Error).message });
    } finally {
      setBusy(null);
    }
  }
  /** Owner-only calls go through the Safe once it owns the target. The guardian can still pause directly. */
  const call = (label: string, target: Address, functionName: string, args: readonly unknown[] = [], guardianOk = false) => {
    if (T && same(ownerOf(target), T) && !(guardianOk && isGuardian)) {
      return viaTimelock(label, target, encodeFunctionData({ abi: adminAbi, functionName: functionName as never, args: args as never }));
    }
    if (S && same(ownerOf(target), S) && !(guardianOk && isGuardian)) {
      return safeExec(label, [{ to: target, data: encodeFunctionData({ abi: adminAbi, functionName: functionName as never, args: args as never }) }]);
    }
    return send(label, () => writeContractAsync({ address: target, abi: adminAbi, functionName: functionName as never, args: args as never, chainId: elysium.id }));
  };

  /** Owner actions behind the timelock: the Safe schedules, waits the delay, then executes. The same button does
   *  each step; the same inputs give the same operation. */
  async function viaTimelock(label: string, target: Address, data: Hex) {
    if (!T || !pub) return;
    const ZB = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
    const id = await pub.readContract({ address: T, abi: timelockAbi, functionName: "hashOperation", args: [target, 0n, data, ZB, ZB] });
    const ts = await pub.readContract({ address: T, abi: timelockAbi, functionName: "getTimestamp", args: [id] });
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (ts === 1n) { setMsg({ ok: false, text: `${label}: this exact action was already executed. Change an input (for example the amount) to run it again.` }); return; }
    if (ts === 0n) {
      const delay = await pub.readContract({ address: T, abi: timelockAbi, functionName: "getMinDelay" });
      return safeExec(`${label}: schedule (${Number(delay) / 3600} h)`, [{ to: T, data: encodeFunctionData({ abi: timelockAbi, functionName: "schedule", args: [target, 0n, data, ZB, ZB, delay] }) }]);
    }
    if (ts > now) { setMsg({ ok: false, text: `${label}: scheduled, can run after ${new Date(Number(ts) * 1000).toLocaleString()}.` }); return; }
    return safeExec(`${label}: execute`, [{ to: T, data: encodeFunctionData({ abi: timelockAbi, functionName: "execute", args: [target, 0n, data, ZB, ZB] }) }]);
  }

  /** Approve on-chain with approveHash; the signer who completes the threshold executes. */
  async function safeExec(label: string, calls: { to: Address; data: Hex }[]) {
    if (!S || !pub || !address) return;
    if (!isSigner) { setMsg({ ok: false, text: "Connect a wallet that signs for the Safe." }); return; }
    const tx = batch(calls);
    const nonce = await pub.readContract({ address: S, abi: safeAbi, functionName: "nonce" });
    const Z = zeroAddress;
    const hash = await pub.readContract({ address: S, abi: safeAbi, functionName: "getTransactionHash", args: [tx.to, 0n, tx.data, tx.operation, 0n, 0n, 0n, Z, Z, nonce] });
    const others: Address[] = [];
    for (const o of safeOwners) {
      if (same(o, address)) continue;
      if ((await pub.readContract({ address: S, abi: safeAbi, functionName: "approvedHashes", args: [o, hash] })) > 0n) others.push(o);
    }
    const need = Number(threshold ?? 2n);
    if (others.length + 1 >= need) {
      const sigs = approvedSignatures([...others.slice(0, need - 1), address]);
      await send(`${label} (Safe)`, () => writeContractAsync({ address: S, abi: safeAbi, functionName: "execTransaction", args: [tx.to, 0n, tx.data, tx.operation, 0n, 0n, 0n, Z, Z, sigs], chainId: elysium.id }));
    } else {
      await send(`${label}: approved ${others.length + 1} of ${need}`, () => writeContractAsync({ address: S, abi: safeAbi, functionName: "approveHash", args: [hash], chainId: elysium.id }));
      setMsg((m) => (m?.ok ? { ...m, text: `${label}: approved ${others.length + 1} of ${need}. Another signer now opens /admin and presses the same button with the same inputs.` } : m));
    }
  }

  if (!R) return <div className="panel pad"><p className="note">Contracts are not deployed yet. This page manages them after the deploy.</p></div>;
  if (!isConnected) return <div className="panel pad"><p className="note">Connect the owner or guardian wallet.</p><button className="cta" type="button" onClick={open}>Connect wallet</button></div>;

  const b = (label: string, on: () => void, disabled = false) => (
    <button key={label} className="ghost" type="button" disabled={!!busy || disabled} onClick={on} style={{ marginRight: 8, marginTop: 8 }}>{busy === label ? `${label}…` : label}</button>
  );
  const recipient = (isAddress(to) ? to : address) as Address;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {msg && <div className={msg.ok ? "ok" : "err"}>{msg.text}{msg.hash && <> · <a href={txUrl(msg.hash)} target="_blank" rel="noopener noreferrer">View</a></>}</div>}

      <div className="panel pad">
        <div className="lbl">YOU ARE</div>
        <p style={{ marginTop: 8 }}><code>{address}</code> · {same(address, routerOwner) ? "owner" : isSigner ? "Safe signer" : isGuardian ? "guardian" : "not owner, Safe signer or guardian (calls will revert)"}{isGuardian && (same(address, routerOwner) || isSigner) ? " · guardian" : ""}</p>
      </div>

      {S && (() => {
        const toMove = owned.filter(([, a], i) => same(ownerOf(a), address) && !same(pendingOf(i), S));
        const toAccept = owned.filter(([, ], i) => same(pendingOf(i), S));
        return (
          <div className="panel pad">
            <div className="lbl">ADMIN SAFE · {threshold ? `${threshold} OF ${safeOwners.length}` : "—"}{T ? " · 48H TIMELOCK" : ""}</div>
            <p style={{ marginTop: 8 }}><a href={addressUrl(S)} target="_blank" rel="noopener noreferrer"><code>{S}</code></a></p>
            <ul className="list">{safeOwners.map((o) => <li key={o}>Signer <code>{short(o)}{same(o, address) ? " (you)" : ""}</code></li>)}</ul>
            {toMove.length > 0 && b(`Step 1: transfer ${toMove.length} contracts to the Safe`, async () => {
              for (const [name, a] of toMove) await send(`Transfer ${name}`, () => writeContractAsync({ address: a, abi: adminAbi, functionName: "transferOwnership", args: [S], chainId: elysium.id }));
            })}
            {toAccept.length > 0 && b(`Step 2: Safe accepts ${toAccept.length} contracts`, () => safeExec("Accept ownership", toAccept.map(([, a]) => ({ to: a, data: encodeFunctionData({ abi: adminAbi, functionName: "acceptOwnership" }) }))), !isSigner)}
            {T && <p className="note">The contracts are owned by the timelock <a href={addressUrl(T)} target="_blank" rel="noopener noreferrer"><code>{short(T)}</code></a>. Every owner action below runs in two rounds with the same inputs: schedule it (one signer approves, a second presses again to send), wait 48 hours, then execute it the same way. The router guardian can still pause at once.</p>}
            <p className="note">Step 1 is sent by the current owner wallet, one transaction per contract. Step 2 needs two signers: the first press approves, the second press (from another signer) executes. The router guardian stays as it is, so pausing stays instant.</p>
          </div>
        );
      })()}

      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>CONTRACT</th><th>OWNER</th><th>PENDING OWNER</th><th /></tr></thead>
          <tbody>
            {owned.map(([name, a], i) => {
              const o = r(2 * i) as Address | undefined, p = r(2 * i + 1) as Address | undefined;
              return (
                <tr key={name}>
                  <td><a href={addressUrl(a)} target="_blank" rel="noopener noreferrer">{name}</a></td>
                  <td><code>{short(o)}</code></td>
                  <td><code>{p && p !== zeroAddress ? short(p) : "—"}</code></td>
                  <td style={{ textAlign: "right" }}>{same(p, address) && b(`Accept ${name}`, () => call(`Accept ${name}`, a, "acceptOwnership"))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ops && T && (() => {
        const rr = (i: number) => roll.data?.[i]?.result;
        const k = nv.length;
        const live = nv.map((_, i) => rr(i) as boolean | undefined);
        const minDelay = rr(k) as bigint | undefined, rDelay = rr(k + 1) as bigint | undefined;
        const tsA = rr(k + 2) as bigint | undefined, tsB = rr(k + 3) as bigint | undefined, eta = rr(k + 4) as bigint | undefined;
        const names = nv.map((v) => v.name).join(" + ");
        const now = BigInt(Math.floor(Date.now() / 1000));
        const when = (t: bigint) => new Date(Number(t) * 1000).toLocaleString();
        const allLive = live.length > 0 && live.every((x) => x === true);
        const loading = roll.isLoading || tsA === undefined || tsB === undefined || minDelay === undefined || rDelay === undefined || eta === undefined;
        // step 3 needs both the timelock (tsB) and the router's own delay (eta, set by step 2)
        const ready3 = tsB !== undefined && eta !== undefined ? (tsB > eta ? tsB : eta) : 0n;
        let step: { label: string; on?: () => void; wait?: string } | null = null;
        if (!loading && !allLive) {
          if (tsA === 0n) step = { label: `Add ${names}: step 1 of 3, schedule`, on: () => safeExec(`Add ${names}: step 1 of 3, schedule`, scheduleCalls(T, ops.a, ops.b, minDelay!, rDelay!)) };
          else if (tsA! > 1n && tsA! > now) step = { label: "Step 2 of 3", wait: `Step 2 (propose on the router) opens ${when(tsA!)}.` };
          else if (tsA! > 1n) step = { label: `Add ${names}: step 2 of 3, propose`, on: () => safeExec(`Add ${names}: step 2 of 3, propose`, [executeCall(T, ops.a)]) };
          else if (tsB! > 1n && (eta === 0n || ready3 > now)) step = { label: "Step 3 of 3", wait: `Step 3 (add to the router) opens ${when(ready3)}.` };
          else if (tsB! > 1n) step = { label: `Add ${names}: step 3 of 3, add to router`, on: () => safeExec(`Add ${names}: step 3 of 3, add to router`, [executeCall(T, ops.b)]) };
        }
        return (
          <div className="panel pad">
            <div className="lbl">NEW VENUES · {net.short.toUpperCase()}</div>
            <ul className="list">{nv.map((v, i) => (
              <li key={v.address}><span>{v.name} adapter <a href={addressUrl(v.address)} target="_blank" rel="noopener noreferrer"><code>{short(v.address)}</code></a></span><b>{live[i] === undefined ? "—" : live[i] ? "in the router" : "not in the router yet"}</b></li>
            ))}</ul>
            {allLive ? (
              <p className="note">Done: every swap on {net.name} now also checks {names}.</p>
            ) : loading ? (
              <p className="note">Reading the timelock…</p>
            ) : (
              <>
                {step?.on && b(step.label, step.on, !isSigner)}
                {step?.wait && <p className="note" style={{ marginTop: 8 }}><b>{step.wait}</b></p>}
                <p className="note">Three rounds through the Safe and the 48h timelock, about three days in total: 1) schedule, 2) after 48 hours, propose on the router, 3) after the router&apos;s {rDelay ? Number(rDelay) / 3600 : "—"}h delay, add them. Each round: the first signer presses the button (approves), a second signer opens this page and presses the same button (sends). Each signer needs a little ETH on {net.name} for gas.</p>
              </>
            )}
          </div>
        );
      })()}

      <div className="grid2 eq">
        <div className="panel pad">
          <div className="lbl">EMERGENCY</div>
          <p className="note">{net.name} router swaps: <b>{paused === undefined ? "—" : paused ? "PAUSED" : "running"}</b>{P && <> · Maker pool: <b>{poolPaused === undefined ? "—" : poolPaused ? "PAUSED" : "running"}</b></>} · Guardian <code>{short(guardian)}</code></p>
          {b("Pause router", () => call("Pause router", R, "pause", [], true), paused === true)}
          {b("Unpause router", () => call("Unpause router", R, "unpause"), paused === false)}
          {P && b(poolPaused ? "Unpause pool" : "Pause pool", () => call(poolPaused ? "Unpause pool" : "Pause pool", P, "setPaused", [!poolPaused]))}
          {P && b("Pull maker quote", () => call("Pull maker quote", P, "cancelQuote"))}
          <p className="note">Owner or guardian can pause; only the owner unpauses the router.</p>
        </div>

        <div className="panel pad">
          <div className="lbl">PROTOCOL FEES</div>
          <ul className="list"><li>{WS} <b>{fmt(accW, 18, 6)}</b></li><li>{US} <b>{fmt(accU, UD, 2)}</b></li></ul>
          {CONTRACTS.buyback && F && same(ownerOf(F), CONTRACTS.buyback) ? (
            <p className="note">The FeeDistributor is owned by StoaBuyback <code>{short(CONTRACTS.buyback)}</code>: protocol fees can only buy and burn $STOA (weekly keeper run). Other fee settings go through StoaBuyback.exec from the timelock.</p>
          ) : (
            <>
              <input className="inp" placeholder={`Send to (default ${short(address)})`} value={to} onChange={(e) => setTo(e.target.value.trim())} />
              {b(`Withdraw ${WS}`, () => call(`Withdraw ${WS}`, F!, "withdrawProtocol", [WHYPE, accW, recipient]), accW === 0n)}
              {b(`Withdraw ${US}`, () => call(`Withdraw ${US}`, F!, "withdrawProtocol", [USDC, accU, recipient]), accU === 0n)}
            </>
          )}
        </div>

        {P && <div className="panel pad">
          <div className="lbl">MAKERS (WHYPE/USDC POOL)</div>
          <input className="inp" placeholder="Maker address 0x…" value={maker} onChange={(e) => setMaker(e.target.value.trim())} />
          {b("Approve maker", () => call("Approve maker", G!, "setMakerApproval", [P, maker, true]), !isAddress(maker) || !G || !P)}
          {b("Revoke maker", () => call("Revoke maker", G!, "setMakerApproval", [P, maker, false]), !isAddress(maker) || !G || !P)}
          <p className="note">A maker also needs a HYPE bond of at least the pool minimum before it can quote.</p>
        </div>}

        <div className="panel pad">
          <div className="lbl">VENUES</div>
          <ul className="list">{Object.entries(VENUE_NAMES).map(([a, nme]) => <li key={a}>{nme} <code>{short(a)}</code></li>)}</ul>
          <input className="inp" placeholder="Venue address 0x…" value={venue} onChange={(e) => setVenue(e.target.value.trim())} />
          <label className="chk"><input type="checkbox" checked={venueIsPool} onChange={(e) => setVenueIsPool(e.target.checked)} /> It is a Stoa pool (not an adapter)</label>
          {b("Propose", () => call("Propose", R, "propose", [venueIsPool, venue]), !isAddress(venue))}
          {b("Execute", () => call("Execute", R, "execute", [venueIsPool, venue]), !isAddress(venue))}
          {b("Cancel", () => call("Cancel", R, "cancel", [venueIsPool, venue]), !isAddress(venue))}
          {b("Remove now", () => call("Remove now", R, venueIsPool ? "removePool" : "removeAdapter", [venue]), !isAddress(venue))}
          <p className="note">{locked ? `New venues wait ${delay ? Number(delay) / 3600 : "—"} h after Propose before Execute works.` : "Setup is not locked yet."} Removing is instant.</p>
        </div>
      </div>
      <p className="note">Amounts above are read on-chain every 15 s. Fees withdraw in full; partial withdrawals can be sent from the contract directly.</p>
    </div>
  );
}

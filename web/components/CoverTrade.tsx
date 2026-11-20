"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { zeroAddress, type Address } from "viem";
import { isNative, type Token } from "@/lib/tokens";
import type { Net } from "@/lib/networks";
import { COVER, GRACE, coverAbi, eth, pct, until, useCoverLive, useTerm, when } from "@/lib/cover";

/** Rug Cover on Trade: when the token being bought has an open cover, offer "Buy with Rug Cover" for ETH buys, say
 *  plainly when a buy cannot be covered, and warn when the creator's wallet is already below its floor. */
export function useCoverOffer({ net, sell, buy, amt, address, onUseEth }: {
  net: Net; sell: Token; buy: Token; amt?: bigint; address?: Address; onUseEth: () => void;
}) {
  const rh = net.key === "robinhood";
  const live = useCoverLive() && rh;
  const token = live && !isNative(buy) ? buy.address : undefined;
  const t = useTerm(token, live);
  const v = t.data;
  const mine = useReadContract({
    address: COVER, abi: coverAbi, functionName: "coverOf", args: [token ?? zeroAddress, v?.id ?? 0n, address ?? zeroAddress],
    chainId: net.chain.id, query: { enabled: !!token && !!v && !!address, refetchInterval: 15_000 },
  });
  const [covered, setCovered] = useState(false);
  // /trade?…&cover=1 (from /cover and the token pages) ticks it once a cover is found
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || !v?.open) return;
    linked.current = true;
    if (new URLSearchParams(location.search).get("cover") === "1") setCovered(true);
  }, [v?.open]);
  useEffect(() => setCovered(false), [buy.address]);
  const known = !!v, isOpen = !!v?.open;
  useEffect(() => { if (known && !isOpen) setCovered(false); }, [known, isOpen]);

  const offer = !!v && v.open;
  const term = v?.term;
  const premium = term && amt ? (amt * BigInt(term.premiumBps)) / 10_000n : 0n;
  const held = (mine.data as bigint | undefined) ?? 0n;
  const walletCap = term ? (term.capacity * BigInt(term.walletCapBps)) / 10_000n : 0n;
  let reason = "";
  if (offer && term) {
    if (!isNative(sell)) reason = "Covered buys are paid in ETH.";
    else if (v.paused) reason = "Rug Cover is paused: covered buys are stopped for now.";
    else if (!v.holding) reason = "The creator's wallet is below its floor: this cover can be breached, not bought.";
    else if (v.salesLeft <= 0) reason = "Covered buys for this term closed a day before it ends.";
    else if (address && address.toLowerCase() === term.creator.toLowerCase()) reason = "The creator cannot buy cover on their own token.";
    else if (amt !== undefined && amt < term.minCover) reason = `One covered buy is at least ${eth(term.minCover, 4)} ETH.`;
    else if (amt !== undefined && amt > term.maxCover) reason = `One covered buy is at most ${eth(term.maxCover, 4)} ETH.`;
    else if (amt !== undefined && amt > v.left) reason = v.left === 0n ? "The cover on this token is sold out." : `Only ${eth(v.left, 4)} ETH of cover is left on this token.`;
    else if (amt !== undefined && held + amt > walletCap) reason = `One wallet can hold up to ${eth(walletCap, 4)} ETH of cover on this token${held > 0n ? `; you hold ${eth(held, 4)}` : ""}.`;
  }
  const ok = offer && !reason && amt !== undefined && amt > 0n;
  const on = covered && offer;

  const block = !live || !v ? null : !v.open ? null : (
    <div className={v.holding ? "cover" : "err"} style={{ marginTop: 12 }}>
      {!v.holding ? (
        <>
          <b>The creator&apos;s wallet is below its floor.</b> It promised to keep {pct(v.term.floor, v.supply)}% of supply and now holds {pct(v.balance, v.supply)}%. Anyone can trigger the breach on <Link href="/cover">Rug Cover</Link>; covered buyers then claim their ETH.
        </>
      ) : (
        <>
          <div className="rowx"><span className="lbl">RUG COVER</span><span className="chip">Covered</span></div>
          <label className="chk" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={on} disabled={!!reason && !on} onChange={(e) => setCovered(e.target.checked)} />
            <span>Buy with Rug Cover{term ? ` (+${term.premiumBps / 100}%${premium > 0n ? `, ${eth(premium, 6)} ETH` : ""})` : ""}</span>
          </label>
          {reason && <div className="note" style={{ color: on ? "#B4442E" : undefined, marginTop: 6 }}>{on ? "This buy would not be covered. " : ""}{reason}{!isNative(sell) && <> <button type="button" className="linkbtn" onClick={onUseEth}>Pay with ETH</button></>}</div>}
          <div className="det" style={{ marginTop: 10 }}>
            <span>Creator</span><span>holds {pct(v.balance, v.supply)}% · floor {pct(v.term.floor, v.supply)}%</span>
            <span>Bond</span><span>{eth(v.term.bond, 3)} ETH · {eth(v.left, 3)} left to cover</span>
            <span>Buys close</span><span>in {until(Number(v.term.endsAt) - 86_400)}</span>
            <span>Covered until</span><span>release, from {when(Number(v.term.endsAt) + GRACE)}</span>
          </div>
          <p className="note">If the creator&apos;s wallet drops below its floor before release, you claim the ETH you spent from their bond. Only that wallet counts: not other wallets, not other sellers. A contract rule, not insurance. <Link href="/cover">More</Link></p>
        </>
      )}
    </div>
  );
  return { offer, on, ok, premium, reason, block, setCovered, term, refetch: () => { t.refetch(); void mine.refetch(); } };
}

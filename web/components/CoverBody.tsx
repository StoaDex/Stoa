"use client";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient, useReadContracts, useSwitchChain } from "wagmi";
import { useChainWrite } from "@/lib/chainWrite";
import { erc20Abi, isAddress, parseEther, parseUnits, zeroAddress, type Address, type Hash } from "viem";
import { PageHead, Sk } from "./ui";
import { useWalletModal } from "./Providers";
import { ROBINHOOD, addressUrlOn, txUrlOn } from "@/lib/networks";
import { getLogsOn } from "@/lib/logs";
import { CA as STOA } from "@/lib/stoaAddress";
import {
  BREACHED, COVER, GRACE, OPEN, RELEASED, SALE_STOP, UNLOCK_DELAY, coverAbi, eth, explainCover, pct, until, useCoverLive, when,
  type Params, type Term,
} from "@/lib/cover";

const net = ROBINHOOD;
const chainId = net.chain.id;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const stoaN = (v?: bigint) => (v === undefined ? undefined : (Number(v) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 }));
const now = () => Math.floor(Date.now() / 1000);
const symAbi = [...erc20Abi];

/** Pending transaction state with a confirmation line; `onDone` refreshes the reads. */
function useSend(onDone: () => void) {
  const pub = usePublicClient({ chainId });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: Hash } | null>(null);
  async function send(label: string, fn: () => Promise<Hash>) {
    if (!pub) return;
    setBusy(label); setMsg(null);
    try {
      const hash = await fn();
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("Transaction reverted");
      setMsg({ ok: true, text: `${label}: confirmed`, hash }); onDone();
    } catch (x) { setMsg({ ok: false, text: explainCover(x) }); } finally { setBusy(null); }
  }
  const note = msg && <div className={msg.ok ? "ok" : "err"} style={{ marginTop: 10 }}>{msg.text}{msg.hash && <> · <a href={txUrlOn(net, msg.hash)} target="_blank" rel="noopener noreferrer">View</a></>}</div>;
  return { busy, send, note };
}

/** Connect, then switch to Robinhood Chain, before any button that writes. */
function Gate({ children, what }: { children: ReactNode; what: string }) {
  const { isConnected, chainId: cur } = useAccount();
  const { open } = useWalletModal();
  const { switchChain } = useSwitchChain();
  if (!isConnected) return <><p className="note">Connect a wallet on Robinhood Chain to {what}.</p><button className="cta" type="button" onClick={open}>Connect wallet</button></>;
  if (cur !== chainId) return <button className="cta" type="button" onClick={() => switchChain({ chainId })}>Switch to Robinhood Chain</button>;
  return <>{children}</>;
}

type Row = { token: Address; symbol: string; id: bigint; term: Term; supply: bigint; balance: bigint };

export default function CoverBody() {
  const live = useCoverLive();
  const g = useReadContracts({
    contracts: [
      { address: COVER!, abi: coverAbi, functionName: "openTokens", chainId },
      { address: COVER!, abi: coverAbi, functionName: "totalBonds", chainId },
      { address: COVER!, abi: coverAbi, functionName: "totalBurned", chainId },
      { address: COVER!, abi: coverAbi, functionName: "paused", chainId },
      { address: COVER!, abi: coverAbi, functionName: "params", chainId },
    ],
    query: { enabled: live, refetchInterval: 30_000 },
  });
  const openList = (g.data?.[0]?.result as Address[] | undefined) ?? [];
  const paused = g.data?.[3]?.result === true;
  const params = g.data?.[4]?.result as Params | undefined;
  const pub = usePublicClient({ chainId });
  const rows = useQuery({
    queryKey: ["cover-open", openList.join(",")],
    enabled: live && !!pub && !!g.data,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Row[]> => {
      if (!openList.length) return [];
      const a = await pub!.multicall({
        contracts: openList.flatMap((t) => [
          { address: COVER!, abi: coverAbi, functionName: "latestTerm", args: [t] },
          { address: t, abi: symAbi, functionName: "symbol" },
          { address: t, abi: symAbi, functionName: "totalSupply" },
        ]),
      });
      const terms = openList.map((t, i) => ({ token: t, latest: a[i * 3].result as unknown as readonly [bigint, Term], symbol: String(a[i * 3 + 1].result ?? "TOKEN"), supply: (a[i * 3 + 2].result as bigint) ?? 0n }));
      const b = await pub!.multicall({ contracts: terms.map((x) => ({ address: x.token, abi: symAbi, functionName: "balanceOf", args: [x.latest[1].creator] })) });
      return terms.map((x, i) => ({ token: x.token, symbol: x.symbol.replace(/[^\w.$-]/g, "").slice(0, 12) || "TOKEN", id: x.latest[0], term: x.latest[1], supply: x.supply, balance: (b[i].result as bigint) ?? 0n }));
    },
  });
  const refresh = () => { void g.refetch(); void rows.refetch(); };

  return (
    <>
      <PageHead eyebrow="RUG COVER · ROBINHOOD CHAIN" title="Rug Cover" action={<Link className="cta" href="/docs/rug-cover">How it works</Link>}>
        A Pons creator puts ETH behind a promise not to sell or move the tokens in their wallet. Buy through Stoa with cover, and if that wallet drops below its promise before the creator takes the bond back, you claim the ETH you spent.
      </PageHead>

      {!live && (
        <div className="notice" style={{ marginBottom: 16 }}>
          Rug Cover is not live yet. The contract deploys to {COVER ? <a href={addressUrlOn(net, COVER)} target="_blank" rel="noopener noreferrer">{short(COVER)}</a> : "its fixed address"} first; this page switches on by itself once it is there.
        </div>
      )}
      {live && paused && <div className="notice" style={{ marginBottom: 16 }}>Paused for safety: new covers, covered buys and locks are stopped. Claims, breaches, releases, unlocks and ETH claims keep working, and backers can take their $STOA out at once.</div>}

      <div className="grid3 sgrid" style={{ marginBottom: 16 }}>
        <Stat label="COVERS OPEN" v={live ? (g.data ? String(openList.length) : undefined) : "—"} sub="Pons tokens whose creator bonded ETH" />
        <Stat label="ETH BONDED BY CREATORS" v={live ? (g.data ? eth((g.data[1]?.result as bigint) ?? 0n, 3) : undefined) : "—"} sub={params ? `${eth(params.minBond, 2)} to ${eth(params.maxBond, 2)} ETH per token during the beta` : "Bonds back their promises"} />
        <Stat label="$STOA BURNED" v={live ? (g.data ? stoaN((g.data[2]?.result as bigint) ?? 0n) : undefined) : "—"} sub="Bought with buyer premiums and part of creator fees" />
      </div>

      <How params={params} />

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="rowx"><div className="lbl">OPEN COVERS</div><span className="chip">{live ? `${openList.length} open` : "Soon"}</span></div>
        {!live || (rows.data && rows.data.length === 0)
          ? <p className="note">{live ? "No open covers right now. Creators open one from the panel below." : "Open covers show here once Rug Cover is live."}</p>
          : !rows.data
            ? <div style={{ marginTop: 12 }}><Sk w={260} /></div>
            : <OpenTable rows={rows.data} onDone={refresh} />}
      </div>

      <div className="grid2 eq" style={{ marginBottom: 16 }}>
        <BuyerPanel live={live} />
        <BackerPanel live={live} paused={paused} />
      </div>
      <CreatorPanel live={live} paused={paused} params={params} onDone={refresh} />

      <div className="panel pad" style={{ marginTop: 16 }}>
        <div className="lbl">WHAT RUG COVER DOES NOT COVER</div>
        <ul className="list">
          <li>Other wallets of the creator <b>Only the wallet that launched the token on Pons counts</b></li>
          <li>The price falling because other holders sell <b>Not a rug by this rule</b></li>
          <li>Buys made without cover, or before the cover opened <b>Only covered buys on Stoa</b></li>
        </ul>
        <p className="note">Rug Cover is a contract with fixed rules, not insurance: it pays what its rules say from the creator&apos;s bond, and nothing else. It has no formal audit yet; it is in Hey Research Lab&apos;s independent security review. During the beta, bonds are capped at {params ? eth(params.maxBond, 2) : "1"} ETH per token. <Link href="/docs/rug-cover">Read the rules</Link>.</p>
      </div>
    </>
  );
}

function Stat({ label, v, sub }: { label: string; v?: string; sub?: string }) {
  return (
    <div className="panel pad">
      <div className="lbl">{label}</div>
      <div style={{ fontFamily: "var(--num)", fontSize: 24, marginTop: 6 }}>{v ?? <Sk w={90} />}</div>
      {sub && <p className="note" style={{ marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

function How({ params }: { params?: Params }) {
  const prem = params ? `${params.premiumBps / 100}%` : "1%";
  const days = params ? Math.round(params.term / 86400) : 7;
  return (
    <div className="grid3" style={{ marginBottom: 16 }}>
      <div className="panel pad"><div className="lbl">1 · THE CREATOR BONDS ETH</div><p style={{ marginTop: 8 }}>The wallet that launched the token on Pons bonds ETH for {days} days. Its whole balance of the token becomes the floor it promises to keep.</p></div>
      <div className="panel pad"><div className="lbl">2 · YOU BUY WITH COVER</div><p style={{ marginTop: 8 }}>Buy the token with ETH on Trade and pay {prem} more. The ETH you spend is your cover. Every premium buys $STOA and burns it.</p></div>
      <div className="panel pad"><div className="lbl">3 · IF THE CREATOR DUMPS</div><p style={{ marginTop: 8 }}>If the creator&apos;s wallet drops below the floor before the bond is released, anyone can trigger the breach. You claim your cover in ETH from the bond, and keep your tokens.</p></div>
    </div>
  );
}

function OpenTable({ rows, onDone }: { rows: Row[]; onDone: () => void }) {
  const { writeContractAsync } = useChainWrite();
  const { isConnected, chainId: cur } = useAccount();
  const { busy, send, note } = useSend(onDone);
  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ marginTop: 8 }}>
          <thead><tr><th>TOKEN</th><th>CREATOR WALLET</th><th className="hm">COVER LEFT</th><th className="hm">COVERED BUYS CLOSE</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const holding = r.balance >= r.term.floor;
              const left = r.term.capacity > r.term.sold ? r.term.capacity - r.term.sold : 0n;
              const closes = Number(r.term.endsAt) - SALE_STOP;
              return (
                <tr key={r.token}>
                  <td><Link href={`/launches/${r.token}`}><b>${r.symbol}</b></Link><div className="note" style={{ marginTop: 2, whiteSpace: "nowrap" }}>{eth(r.term.bond, 3)} ETH bond · term {r.id.toString()}</div></td>
                  <td>
                    <span className="chip" style={holding ? undefined : { background: "#FDECEA", color: "#B4442E" }}>{holding ? "Holding" : "Below floor"}</span>
                    <div className="note" style={{ marginTop: 4 }}>holds {pct(r.balance, r.supply)}% · floor {pct(r.term.floor, r.supply)}%</div>
                  </td>
                  <td className="hm" style={{ fontFamily: "var(--num)" }}>{eth(left, 3)} ETH</td>
                  <td className="hm">{closes > now() ? `in ${until(closes)}` : "closed"}<div className="note" style={{ marginTop: 2 }}>release from {when(Number(r.term.endsAt) + GRACE)}</div></td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {holding
                      ? closes > now() && left > 0n
                        ? <Link className="ghost" href={`/trade?chain=robinhood&sell=ETH&buy=${r.token}&cover=1`}>Buy with cover</Link>
                        : <span className="note">{left === 0n ? "Cover sold out" : "Buys closed"}</span>
                      : isConnected && cur === chainId
                        ? <button className="cta" type="button" disabled={!!busy} onClick={() => send(`Breach $${r.symbol}`, () => writeContractAsync({ address: COVER!, abi: coverAbi, functionName: "breach", args: [r.token], chainId }))}>{busy ? "Breaching…" : `Breach · earn ${eth(r.term.bond * BigInt(r.term.bountyBps) / 10_000n, 4)} ETH`}</button>
                        : <span className="note">Breachable: connect to trigger it</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {note}
      <p className="note">A wallet below its floor can be breached by anyone, who earns {rows[0] ? `${rows[0].term.bountyBps / 100}%` : "1%"} of the bond. Stoa&apos;s keeper also checks every open cover about every 5 minutes.</p>
    </>
  );
}

/** Covers this wallet bought, from the contract's Covered events, with a claim button after a breach. */
function BuyerPanel({ live }: { live: boolean }) {
  const { address } = useAccount();
  const pub = usePublicClient({ chainId });
  const { writeContractAsync } = useChainWrite();
  const q = useQuery({
    queryKey: ["cover-mine", address],
    enabled: live && !!pub && !!address,
    refetchInterval: 60_000,
    queryFn: async () => {
      const ev = coverAbi.find((x) => x.type === "event" && x.name === "Covered") as never;
      const logs = (await getLogsOn(net, { address: COVER!, event: ev, args: { buyer: address }, fromBlock: net.deployBlock })) as unknown as { args: { token: Address; id: bigint; cover: bigint } }[];
      const bought = new Map<string, { token: Address; id: bigint; total: bigint }>();
      for (const l of logs) {
        const k = `${l.args.token}-${l.args.id}`;
        const b = bought.get(k) ?? { token: l.args.token, id: l.args.id, total: 0n };
        b.total += l.args.cover; bought.set(k, b);
      }
      const list = [...bought.values()];
      if (!list.length) return [];
      const a = await pub!.multicall({
        contracts: list.flatMap((b) => [
          { address: COVER!, abi: coverAbi, functionName: "term", args: [b.token, b.id] },
          { address: COVER!, abi: coverAbi, functionName: "coverOf", args: [b.token, b.id, address!] },
          { address: b.token, abi: symAbi, functionName: "symbol" },
        ]),
      });
      return list.map((b, i) => ({ ...b, term: a[i * 3].result as unknown as Term, owed: (a[i * 3 + 1].result as bigint) ?? 0n, symbol: String(a[i * 3 + 2].result ?? "TOKEN").replace(/[^\w.$-]/g, "").slice(0, 12) }));
    },
  });
  const { busy, send, note } = useSend(() => void q.refetch());
  return (
    <div className="panel pad">
      <div className="lbl">YOUR COVERS</div>
      {!live ? <p className="note">Covers you buy show here, with a claim button if a creator breaches.</p>
        : !address ? <Gate what="see your covers">{null}</Gate>
        : q.isLoading ? <div style={{ marginTop: 12 }}><Sk w={200} /></div>
        : !q.data?.length ? <p className="note">No covered buys from this wallet yet. Pick a token under Open covers, or look for the Covered badge on Trade and Launches.</p>
        : <ul className="list">
            {q.data.map((c) => {
              const st = c.term?.status;
              return (
                <li key={`${c.token}-${c.id}`}>
                  <span><Link href={`/launches/${c.token}`}>${c.symbol}</Link> · {eth(c.total, 4)} ETH covered</span>
                  {st === BREACHED
                    ? c.owed > 0n
                      ? <Gate what="claim"><button className="cta" type="button" disabled={!!busy} onClick={() => send(`Claim ${eth(c.owed)} ETH`, () => writeContractAsync({ address: COVER!, abi: coverAbi, functionName: "claim", args: [c.token, c.id, address], chainId }))}>{busy ? "Claiming…" : `Claim ${eth(c.owed)} ETH`}</button></Gate>
                      : <b>Breached · claimed</b>
                    : st === RELEASED ? <b>Ended · creator kept the floor</b>
                    : st === OPEN ? <b>Active · release from {when(Number(c.term.endsAt) + GRACE)}</b>
                    : <b>—</b>}
                </li>
              );
            })}
          </ul>}
      {note}
      <p className="note">Your cover follows your purchase, not your balance: if the creator breaches before releasing the bond, you claim the ETH you spent even if you already sold.</p>
    </div>
  );
}

function BackerPanel({ live, paused }: { live: boolean; paused: boolean }) {
  const { address } = useAccount();
  const { writeContractAsync } = useChainWrite();
  const me = address ?? zeroAddress;
  const r = useReadContracts({
    contracts: [
      { address: STOA, abi: erc20Abi, functionName: "balanceOf", args: [me], chainId },
      { address: STOA, abi: erc20Abi, functionName: "allowance", args: [me, COVER!], chainId },
      { address: COVER!, abi: coverAbi, functionName: "backers", args: [me], chainId },
      { address: COVER!, abi: coverAbi, functionName: "earned", args: [me], chainId },
      { address: COVER!, abi: coverAbi, functionName: "credits", args: [me], chainId },
      { address: COVER!, abi: coverAbi, functionName: "totalActive", chainId },
      { address: COVER!, abi: coverAbi, functionName: "unstreamed", chainId },
    ],
    query: { enabled: live, refetchInterval: 15_000 },
  });
  const [amt, setAmt] = useState("");
  const { busy, send, note } = useSend(() => { void r.refetch(); setAmt(""); });
  const bal = r.data?.[0]?.result as bigint | undefined, allow = (r.data?.[1]?.result as bigint | undefined) ?? 0n;
  const [active, pending, unlockAt] = (r.data?.[2]?.result as readonly [bigint, bigint, bigint] | undefined) ?? [0n, 0n, 0n];
  const earned = (r.data?.[3]?.result as bigint | undefined) ?? 0n, credit = (r.data?.[4]?.result as bigint | undefined) ?? 0n;
  const totalActive = (r.data?.[5]?.result as bigint | undefined) ?? 0n, streaming = (r.data?.[6]?.result as bigint | undefined) ?? 0n;
  let raw: bigint | undefined;
  try { raw = amt ? parseUnits(amt, 18) : undefined; } catch { raw = undefined; }
  const t = BigInt(now());
  const btn = (label: string, on: () => void, disabled: boolean) => (
    <button className="ghost" type="button" disabled={!!busy || disabled} onClick={on} style={{ marginRight: 8, marginTop: 8 }}>{busy === label ? `${label}…` : label}</button>
  );
  const w = (functionName: "lock" | "requestUnlock", a: bigint) => writeContractAsync({ address: COVER!, abi: coverAbi, functionName, args: [a], chainId });
  return (
    <div className="panel pad">
      <div className="rowx"><div className="lbl">BACK RUG COVER WITH $STOA</div><span className="chip">{live ? `${eth(streaming, 4)} ETH streaming` : "Soon"}</span></div>
      <p style={{ marginTop: 8 }}>Lock $STOA and earn ETH from creators: 90% of creator fees and of forfeited bonds, paid out over 7 days. Your $STOA never pays for a breach. Buyer premiums are not shared: they are burned.</p>
      {!live ? null : (
        <>
          <ul className="list">
            <li>In your wallet <b>{address ? (stoaN(bal) ?? "—") : "—"} STOA</b></li>
            <li>Locked, earning <b>{stoaN(active)} STOA{totalActive > 0n && active > 0n ? ` · ${pct(active, totalActive)}% of all` : ""}</b></li>
            <li>Unlocking <b>{stoaN(pending)} STOA{pending > 0n ? ` · ${unlockAt <= t ? "ready" : `from ${when(unlockAt)}`}` : ""}</b></li>
            <li>ETH to claim <b>{eth(earned, 6)} ETH</b></li>
          </ul>
          <Gate what="lock $STOA">
            <input className="inp" inputMode="decimal" placeholder="Amount of $STOA" value={amt} onChange={(x) => setAmt(x.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, ""))} />
            {raw !== undefined && raw > 0n && allow < raw
              ? btn("Approve $STOA", () => send("Approve $STOA", () => writeContractAsync({ address: STOA, abi: erc20Abi, functionName: "approve", args: [COVER!, raw!], chainId })), paused || raw > (bal ?? 0n))
              : btn("Lock", () => send("Lock", () => w("lock", raw!)), paused || !raw || raw > (bal ?? 0n))}
            {btn("Request unlock", () => send("Request unlock", () => w("requestUnlock", raw!)), !raw || raw > active)}
            {btn("Withdraw", () => send("Withdraw", () => writeContractAsync({ address: COVER!, abi: coverAbi, functionName: "withdraw", args: [address!], chainId })), pending === 0n || unlockAt > t)}
            {btn(`Claim ${eth(earned)} ETH`, () => send("Claim ETH", () => writeContractAsync({ address: COVER!, abi: coverAbi, functionName: "claimRewards", args: [address!], chainId })), earned === 0n)}
            {paused && btn("Withdraw everything now", () => send("Withdraw everything now", () => writeContractAsync({ address: COVER!, abi: coverAbi, functionName: "emergencyWithdraw", args: [address!], chainId })), active + pending === 0n)}
            {credit > 0n && btn(`Withdraw ${eth(credit)} ETH breach bounty`, () => send("Withdraw bounty", () => writeContractAsync({ address: COVER!, abi: coverAbi, functionName: "withdrawCredit", args: [address!], chainId })), false)}
          </Gate>
          {note}
          <p className="note">Unlocking takes {UNLOCK_DELAY / 86400} days, and $STOA stops earning as soon as you request it. This lock is separate from the Spotlight lock. When nobody is locked, backer income is burned instead.</p>
        </>
      )}
    </div>
  );
}

/** For a token's creator: open a cover with a bond, or release it after the term. */
function CreatorPanel({ live, paused, params, onDone }: { live: boolean; paused: boolean; params?: Params; onDone: () => void }) {
  const { address } = useAccount();
  const { writeContractAsync } = useChainWrite();
  const [token, setToken] = useState("");
  const [bondTxt, setBondTxt] = useState("");
  const [ack, setAck] = useState(false);
  const valid = isAddress(token);
  const t = valid ? (token as Address) : undefined;
  const me = address ?? zeroAddress;
  const r = useReadContracts({
    contracts: [
      { address: COVER!, abi: coverAbi, functionName: "creatorOf", args: [t ?? zeroAddress], chainId },
      { address: t ?? zeroAddress, abi: symAbi, functionName: "balanceOf", args: [me], chainId },
      { address: t ?? zeroAddress, abi: symAbi, functionName: "totalSupply", chainId },
      { address: t ?? zeroAddress, abi: symAbi, functionName: "symbol", chainId },
      { address: COVER!, abi: coverAbi, functionName: "latestTerm", args: [t ?? zeroAddress], chainId },
      { address: COVER!, abi: coverAbi, functionName: "totalBonds", chainId },
    ],
    query: { enabled: live && !!t, refetchInterval: 15_000 },
  });
  const { busy, send, note } = useSend(() => { void r.refetch(); onDone(); });
  const creator = r.data?.[0]?.result as Address | undefined;
  const bal = (r.data?.[1]?.result as bigint | undefined) ?? 0n, supply = (r.data?.[2]?.result as bigint | undefined) ?? 0n;
  const sym = String(r.data?.[3]?.result ?? "TOKEN").replace(/[^\w.$-]/g, "").slice(0, 12);
  const latest = r.data?.[4]?.result as readonly [bigint, Term] | undefined;
  const totalBonds = (r.data?.[5]?.result as bigint | undefined) ?? 0n;
  const term = latest && latest[0] > 0n ? latest[1] : undefined;
  let bond: bigint | undefined;
  try { bond = bondTxt ? parseEther(bondTxt) : undefined; } catch { bond = undefined; }
  const fee = useMemo(() => {
    if (!bond || !params) return undefined;
    const f = bond * BigInt(params.feeBps) / 10_000n;
    return f < params.minFee ? params.minFee : f;
  }, [bond, params]);

  const isCreator = !!address && !!creator && creator !== zeroAddress && creator.toLowerCase() === address.toLowerCase();
  const openTerm = term && term.status === OPEN ? term : undefined;
  const canRelease = !!openTerm && openTerm.creator.toLowerCase() === me.toLowerCase() && now() >= Number(openTerm.endsAt) + GRACE && bal >= openTerm.floor;
  let why = "";
  if (!t) why = "";
  else if (!r.data) why = "Reading the token…";
  else if (!creator || creator === zeroAddress) why = "This token is not a Pons launch. Only Pons tokens can be covered.";
  else if (!isCreator) why = `Only the wallet that launched $${sym} on Pons (${short(creator)}) can open its cover.`;
  else if (openTerm) why = `$${sym} already has an open cover (term ${latest![0]}).`;
  else if (!params) why = "Reading the rules…";
  // RugCover stores the floor as uint128: a balance above that would be cut short, so the app refuses it (PR #6)
  else if (bal > 2n ** 128n - 1n) why = `This wallet's $${sym} balance is larger than Rug Cover can record as a floor, so a cover cannot be opened for it.`;
  else if (bal === 0n || bal * 10_000n < supply * BigInt(params.minFloorBps)) why = `Your wallet holds ${pct(bal, supply)}% of $${sym}. A cover needs at least ${params.minFloorBps / 100}% of supply in the creator wallet.`;
  else if (bond !== undefined && (bond < params.minBond || bond > params.maxBond)) why = `The bond must be between ${eth(params.minBond, 3)} and ${eth(params.maxBond, 3)} ETH during the beta.`;
  else if (bond !== undefined && totalBonds + bond > params.maxTotalBonds) why = `Rug Cover holds ${eth(totalBonds, 2)} of its ${eth(params.maxTotalBonds, 0)} ETH beta limit. Try a smaller bond.`;
  else if (paused) why = "Rug Cover is paused: new covers are stopped.";
  const ready = !why && !!bond && !!fee && ack;

  return (
    <div className="panel pad">
      <div className="rowx"><div className="lbl">FOR CREATORS · OPEN A COVER</div><span className="chip">Pons tokens only</span></div>
      <p style={{ marginTop: 8 }}>
        Bond ETH behind your promise not to sell or move the tokens in your creator wallet for {params ? Math.round(params.term / 86400) : 7} days. Buyers see a Covered badge and can buy with cover on Stoa. Keep your whole balance and you take the bond back after the term; drop below it and the bond pays covered buyers first.
      </p>
      {!live ? <p className="note">Opens when Rug Cover is live.</p> : (
        <Gate what="open a cover for your token">
          <input className="inp" placeholder="Your Pons token address (0x…)" value={token} spellCheck={false} onChange={(e) => { setToken(e.target.value.trim()); setAck(false); }} />
          {valid && r.data && creator && creator !== zeroAddress && (
            <ul className="list">
              <li>Token <b>${sym} · {short(t!)}</b></li>
              <li>Creator wallet <b>{short(creator)}{isCreator ? " (you)" : ""}</b></li>
              <li>Floor if you open now <b>{stoaN(bal)} {sym} · {pct(bal, supply)}% of supply</b></li>
              {term && <li>Latest term <b>#{latest![0].toString()} · {term.status === OPEN ? "open" : term.status === RELEASED ? "released" : "breached"}</b></li>}
            </ul>
          )}
          {isCreator && !openTerm && params && (
            <>
              <input className="inp" inputMode="decimal" placeholder={`Bond in ETH (${eth(params.minBond, 2)} to ${eth(params.maxBond, 2)})`} value={bondTxt} onChange={(e) => setBondTxt(e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, ""))} />
              {bond && fee !== undefined && (
                <ul className="list">
                  <li>Bond, back to you after the term if you hold <b>{eth(bond, 4)} ETH</b></li>
                  <li>Fee, not refunded <b>{eth(fee, 4)} ETH</b></li>
                  <li>Cover buyers can buy <b>{eth(bond * BigInt(params.capacityBps) / 10_000n, 4)} ETH</b></li>
                  <li>You send <b>{eth(bond + fee, 4)} ETH</b></li>
                </ul>
              )}
              <label className="chk"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand: if this wallet&apos;s ${sym} balance drops below {stoaN(bal)} at any time before I release the bond, by selling or moving tokens, the bond pays covered buyers and I lose it.</label>
            </>
          )}
          {why && <div className="notice" style={{ marginTop: 10, marginBottom: 0 }}>{why}</div>}
          {isCreator && !openTerm && (
            <button className="cta" type="button" style={{ marginTop: 12 }} disabled={!!busy || !ready}
              onClick={() => send(`Open cover for $${sym}`, () => writeContractAsync({ address: COVER!, abi: coverAbi, functionName: "open", args: [t!, bond!], value: bond! + fee!, chainId }))}>
              {busy ? "Opening…" : bond && fee ? `Open cover · send ${eth(bond + fee, 4)} ETH` : "Open cover"}
            </button>
          )}
          {openTerm && openTerm.creator.toLowerCase() === me.toLowerCase() && (
            <>
              <ul className="list">
                <li>Your bond <b>{eth(openTerm.bond, 4)} ETH</b></li>
                <li>Cover sold <b>{eth(openTerm.sold, 4)} of {eth(openTerm.capacity, 4)} ETH</b></li>
                <li>Your floor <b>{stoaN(openTerm.floor)} {sym} · you hold {stoaN(bal)}</b></li>
                <li>Release from <b>{when(Number(openTerm.endsAt) + GRACE)}</b></li>
              </ul>
              <button className="cta" type="button" style={{ marginTop: 12 }} disabled={!!busy || !canRelease}
                onClick={() => send("Release bond", () => writeContractAsync({ address: COVER!, abi: coverAbi, functionName: "release", args: [t!, address!], chainId }))}>
                {busy ? "Releasing…" : canRelease ? `Release ${eth(openTerm.bond, 4)} ETH` : bal < openTerm.floor ? "Below your floor: cannot release" : `Release opens in ${until(Number(openTerm.endsAt) + GRACE)}`}
              </button>
            </>
          )}
          {note}
        </Gate>
      )}
      <p className="note">Only the wallet the Pons factory records as the token&apos;s creator can open its cover. Tokens you buy after opening can be sold, as long as the balance stays at or above the floor. Your other wallets are not part of the promise, and buyers are told so.</p>
    </div>
  );
}

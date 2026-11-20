import type { Metadata } from "next";
import Link from "next/link";
import { CONTRACTS, addressUrl, elysium } from "@/lib/chain";
import { USDC, WHYPE } from "@/lib/tokens";
import { ROBINHOOD, addressUrlOn } from "@/lib/networks";
import { PageHead } from "@/components/ui";
import CopyButton from "@/components/CopyButton";

export const metadata: Metadata = {
  title: "Integrate Stoa",
  description: "Put Stoa in your token page, bot, wallet, AI agent or contract: a buy card, an HTTP API, an MCP server and the router. No key needed, and referrers earn 10% of Stoa's fee.",
  alternates: { canonical: "/build" },
};
const API = `GET https://stoadex.com/api/v1/quote
  ?chain=robinhood&sellToken=native
  &buyToken=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
  &amount=10000000000000000&slippageBps=50
  &taker=0xYourWallet&referrer=0xYourWallet
→ { amountOut, minOut, route, tx: { to, data, value } }`;
const MCP = `claude mcp add --transport http stoa https://stoadex.com/mcp

# or in any MCP client config
{ "mcpServers": { "stoa": { "url": "https://stoadex.com/mcp" } } }`;

const WAYS: { lbl: string; who: string; body: string; href: string; cta: string }[] = [
  { lbl: "SWAP WIDGET", who: "For token projects", body: "A swap box for your token's website: visitors type an amount, see Stoa's live quote across every venue, and swap on Stoa with it filled in. Light or dark, one line of HTML. A smaller buy card is in the docs.", href: "/build/widget", cta: "Make your widget" },
  { lbl: "HTTP API", who: "For bots, wallets and Telegram bots", body: "One call returns the route for any amount across every venue, plus the swap transaction to send. No key, 60 requests a minute.", href: "/docs/api", cta: "API docs" },
  { lbl: "MCP SERVER", who: "For AI agents", body: "stoadex.com/mcp: list tokens, quote, safety check, build an unsigned swap, bridge in, market context and stock tokens. Works in Claude, Cursor, Codex and Nomad. The user's wallet signs.", href: "/agents", cta: "Stoa for agents" },
  { lbl: "ROUTER CONTRACTS", who: "For contracts and aggregators", body: "Call StoaRouter from your own contract or front end: quote with an eth_call, then swap with your own limits. Same ABI on Robinhood Chain and Elysium.", href: "/docs/router-sdk", cta: "Router docs" },
];
const USED: { name: string; href: string; what: string }[] = [
  { name: "Nomad 0.6.0", href: "https://github.com/kadiri-seer/nomad/blob/main/docs/guides/stoa-setups.md", what: "Stoa's MCP tools built into the agent" },
  { name: "Autonomo", href: "https://autonomo.fun", what: "Stoa's Token Safety Check and Swap Quote as paid agent APIs ($0.01 a call, x402)" },
  { name: "Stoa Quote Bot · Community", href: "https://t.me/Stoatrade_bot", what: "community Telegram bot: /quote and /check for Robinhood Chain tokens, built on Stoa's API" },
  { name: "Stoa Dashboard · Community", href: "https://doms99999.github.io/stoa-dashboard/", what: "community dashboard of Stoa's swaps on Robinhood Chain: volume, traders, referrers and routes per venue, read from the router's Routed events, queries open" },
];
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const BOUNTIES: { t: string; b: string; won?: { href: string; tx?: string } }[] = [
  { t: "Telegram bot", b: "A bot in a public group that answers /quote and /check for any Robinhood Chain token, using Stoa's HTTP API or MCP server, and links each quote to a swap on Stoa.", won: { href: "https://github.com/StoaDex/Stoa/issues/7", tx: "https://robinhoodchain.blockscout.com/tx/0xcb332b52c50dfd461da2895886c37d47aa3d70d0d8271a35c5d4d7007ee3544c" } },
  { t: "Swap widget on a token's site", b: "Stoa's swap widget or buy card live on the website of a token that trades on Robinhood Chain, added by you with the project's agreement." },
  { t: "Public dashboard", b: "A public dashboard of Stoa's swaps on Robinhood Chain (volume, traders, routes per venue) built from on-chain data on Dune, Blockscout or your own site, with its queries shared.", won: { href: "https://github.com/StoaDex/Stoa/issues/14" } },
];

const SOL = `// 1. off-chain: route = router.quote(USDC, WHYPE, 250e6)  (eth_call)
// 2. on-chain: follow the route with your limits
IStoaRouter.SwapParams memory p = IStoaRouter.SwapParams({
  tokenIn: USDC, tokenOut: WHYPE,       // address(0) = native HYPE
  mid: route.mid,                       // zero for a direct swap
  leg1: route.leg1, leg2: route.leg2,   // allowlisted venues only
  amountIn: 250e6,
  minOut: route.amountOut * 995 / 1000, // 0.5% slippage
  to: msg.sender, deadline: block.timestamp + 60,
  referrer: address(0)
});
IStoaRouter(router).swap(p);`;
const TS = `import { createPublicClient, createWalletClient, custom, http, parseUnits } from 'viem'
import { elysium } from './chain'                    // chain id 99901, rpc.elysium.kinetiq.xyz
import routerAbi from './StoaRouter.json'           // stoadex.com/abi/StoaRouter.json

const ROUTER = '0x104752D50ef893da579Ad813918269e09Ea17dbA'
const USDC = '0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65'
const NATIVE = '0x0000000000000000000000000000000000000000' // HYPE
const pub = createPublicClient({ chain: elysium, transport: http() })
const wallet = createWalletClient({ chain: elysium, transport: custom(window.ethereum) })
const [me] = await wallet.getAddresses()

// 1. best route across every venue, direct or via WHYPE (eth_call, free)
const amountIn = parseUnits('1', 18) // 1 HYPE
const { result: q } = await pub.simulateContract({
  address: ROUTER, abi: routerAbi, functionName: 'quote', args: [NATIVE, USDC, amountIn],
})

// 2. swap along that route with a 0.5% limit
await wallet.writeContract({
  account: me, address: ROUTER, abi: routerAbi, functionName: 'swap', value: amountIn,
  args: [{ tokenIn: NATIVE, tokenOut: USDC, mid: q.mid, leg1: q.leg1, leg2: q.leg2,
    amountIn, minOut: q.amountOut * 995n / 1000n, to: me,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 120), referrer: NATIVE }], // referrer: your address to earn 10%
})
// ERC-20 input: approve the router for amountIn first (or use swapWithPermit2), and send no value`;

export default function BuildPage() {
  const rows: [string, string | undefined][] = [["WHYPE", WHYPE], ["USDC", USDC], ["Permit2", "0x000000000022D473030F116dDEE9F6B43aC78BA3"]];
  const stoa: [string, string | undefined][] = [["StoaRouter", CONTRACTS.router], ["StoaPool (WHYPE/USDC)", CONTRACTS.pool], ["FeeDistributor", CONTRACTS.fees]];
  const R = ROBINHOOD.contracts;
  const rhRows: [string, string][] = [["WETH", ROBINHOOD.wrapped], ["USDG", ROBINHOOD.stable], ["Permit2", "0x000000000022D473030F116dDEE9F6B43aC78BA3"]];
  const rhStoa: [string, string | undefined][] = [["StoaRouter", R.router], ["FeeDistributor", R.fees], ["UniswapV4Adapter", R.v4], ["Admin Safe (2 of 3)", R.safe], ["Timelock (48h)", R.timelock]];
  return (
    <section className="page">
      <PageHead eyebrow="IV · BUILD" title="Integrate Stoa">Put Stoa in your token page, bot, wallet, AI agent or contract. No key needed.</PageHead>
      <div className="lbl" style={{ margin: "0 0 12px 4px" }}>PICK YOUR WAY IN</div>
      <div className="grid2 eq" style={{ marginBottom: 20 }}>
        {WAYS.map((w) => (
          <div key={w.lbl} className="panel pad">
            <div className="rowx"><div className="lbl">{w.lbl}</div><span className="note" style={{ marginTop: 0 }}>{w.who}</span></div>
            <p style={{ marginTop: 10 }}>{w.body}</p>
            <Link className="go" href={w.href}>{w.cta}</Link>
          </div>
        ))}
      </div>
      <div id="bounties" className="panel pad" style={{ marginBottom: 20 }}>
        <div className="rowx"><div className="lbl">BUILD BOUNTIES · $150 IN USDG · 1 OPEN</div><span className="chip">Open until Sun 20 Dec 2026, 23:59 UTC</span></div>
        <p style={{ marginTop: 10 }}>Three bounties of $50 each, paid in USDG on Robinhood Chain to the first working entry for each one.</p>
        <ol className="list" style={{ marginTop: 8, paddingLeft: 18 }}>
          {BOUNTIES.map((b) => <li key={b.t} style={{ marginBottom: 8 }}><b>{b.t}.</b> {b.b}{b.won && <> <span className="chip">Claimed</span> <a href={b.won.href} target="_blank" rel="noopener noreferrer">Entry</a>{b.won.tx && <> · <a href={b.won.tx} target="_blank" rel="noopener noreferrer">Paid tx</a></>}</>}</li>)}
        </ol>
        <p className="note" style={{ marginTop: 8 }}>To count, it has to be live and public, its code open on GitHub, and every swap it sends has to name your address as <code>referrer</code>, so you also earn the referrer share. Stoa checks each entry before paying; one bounty per person. No wash trading: entries that inflate swaps are not paid.</p>
        <a className="go" href="https://github.com/StoaDex/Stoa/issues/new?title=Bounty%3A%20&labels=bounty" target="_blank" rel="noopener noreferrer">Submit on GitHub</a>
      </div>
      <div className="panel pad" style={{ marginBottom: 20 }}>
        <div className="rowx"><div className="lbl">EARN 10% AS A REFERRER</div><Link className="note" style={{ marginTop: 0 }} href="/docs/referrals">Docs →</Link></div>
        <p style={{ marginTop: 10 }}>Name your address as <code>referrer</code> and you earn 10% of Stoa&apos;s 2 bps fee on every swap you send: about $0.02 per $1,000 swapped, in the token the trader received. It works the same in the buy card, the API, the MCP server&apos;s <code>build_swap</code> and the router&apos;s <code>swap</code>. Earnings are booked to your address in the FeeDistributor contract on-chain, and only your wallet can claim them on <Link href="/referrals">Referrals</Link>. Bring 10 or more different wallets in a month and you also get a <Link href="/referrals#integrator-bonus">$10 USDG integrator bonus</Link> for that month.</p>
      </div>
      <div className="panel pad" style={{ marginBottom: 20 }}>
        <div className="lbl">USED BY</div>
        <ul className="list" style={{ marginTop: 8 }}>
          {USED.map((u) => <li key={u.name}><a href={u.href} target="_blank" rel="noopener noreferrer"><b>{u.name}</b></a> <span className="note" style={{ marginTop: 0 }}>{u.what}</span></li>)}
        </ul>
        <p className="note" style={{ marginTop: 10 }}>Listed here means integrated, not endorsed: the buy card and the API are open to anyone. Integrated Stoa? Tell us on <a href="https://x.com/StoaDEX" target="_blank" rel="noopener noreferrer">X</a> and we&apos;ll add you here.</p>
      </div>
      <div className="panel pad" style={{ marginBottom: 20 }}>
        <div className="rowx"><div className="lbl">HTTP API FOR BOTS · NO KEY</div><Link className="note" style={{ marginTop: 0 }} href="/docs/api">Docs →</Link></div>
        <pre className="code" style={{ marginTop: 12 }}>{API}</pre>
      </div>
      <div className="panel pad" style={{ marginBottom: 20 }}>
        <div className="rowx"><div className="lbl">MCP SERVER FOR AI AGENTS · NO KEY</div><Link className="note" style={{ marginTop: 0 }} href="/docs/mcp">Docs →</Link></div>
        <pre className="code" style={{ marginTop: 12 }}>{MCP}</pre>
      </div>
      <div className="grid2 eq">
        <div className="panel pad">
          <div className="lbl">TYPESCRIPT (VIEM) · COMPLETE EXAMPLE</div>
          <pre className="code" style={{ marginTop: 12 }}>{TS}</pre>
          <div className="lbl" style={{ marginTop: 18 }}>SOLIDITY</div>
          <pre className="code" style={{ marginTop: 12 }}>{SOL}</pre>
          <p className="note" style={{ marginTop: 14 }}>For AI agents: <a href="https://www.npmjs.com/package/@stoadex/agent-tools" target="_blank" rel="noopener noreferrer"><code>npm i @stoadex/agent-tools</code></a> (Vercel AI SDK, LangChain, OpenAI). For contracts: use viem or ethers with the router ABI. <a href="/abi/StoaRouter.json" download>Download StoaRouter.json</a></p>
          <Link className="go" href="/docs/router-sdk">Router and SDK docs</Link>
        </div>
        <div className="panel pad">
          <div className="lbl">ELYSIUM NETWORK</div>
          <ul className="list">
            <li>Chain ID <b>{elysium.id}</b></li>
            {rows.map(([n, a]) => <li key={n}>{n} <span className="addr"><code>{short(a!)}</code><CopyButton text={a!} /></span></li>)}
          </ul>
          <div className="lbl" style={{ marginTop: 20 }}>STOA CONTRACTS</div>
          <ul className="list">
            {stoa.map(([n, a]) => <li key={n}>{n} {a ? <span className="addr">{addressUrl(a) ? <a href={addressUrl(a)} target="_blank" rel="noopener noreferrer"><code>{short(a)}</code></a> : <code>{short(a)}</code>}<CopyButton text={a} /></span> : <b>Deploying soon</b>}</li>)}
          </ul>
          <div className="lbl" style={{ marginTop: 28 }}>ROBINHOOD CHAIN NETWORK</div>
          <ul className="list">
            <li>Chain ID <b>{ROBINHOOD.chain.id}</b></li>
            {rhRows.map(([n, a]) => <li key={n}>{n} <span className="addr"><code>{short(a)}</code><CopyButton text={a} /></span></li>)}
          </ul>
          <div className="lbl" style={{ marginTop: 20 }}>STOA ON ROBINHOOD CHAIN</div>
          <ul className="list">
            {rhStoa.map(([n, a]) => <li key={n}>{n} {a ? <span className="addr"><a href={addressUrlOn(ROBINHOOD, a)} target="_blank" rel="noopener noreferrer"><code>{short(a)}</code></a><CopyButton text={a} /></span> : <b>Deploying soon</b>}</li>)}
          </ul>
          <p className="note">Same router code and ABI on both networks. On Robinhood Chain the native coin is ETH (address(0)) and the hop token is WETH.</p>
        </div>
      </div>
    </section>
  );
}

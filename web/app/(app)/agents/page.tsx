import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import CopyButton from "@/components/CopyButton";

export const metadata: Metadata = {
  title: "Stoa for AI agents",
  description: "Give your AI agent swaps on Robinhood Chain: a hosted MCP server, an HTTP API, TypeScript agent tools and a skill file. No key. Quotes compare every venue Stoa routes; the user's wallet signs. Referrers earn 10% of Stoa's fee.",
  alternates: { canonical: "/agents" },
};

const MCP = "https://stoadex.com/mcp";
const CLAUDE = "claude mcp add --transport http stoa https://stoadex.com/mcp";
const NPM = "npm i @stoadex/agent-tools";

const TOOLS: [string, string][] = [
  ["quote", "Every venue Stoa routes, compared for the exact amount: output after the 2 bps fee, minimum, price impact, route"],
  ["build_swap", "The same quote plus an unsigned transaction for the user's wallet (and the approval it needs first)"],
  ["safety_check", "A simulated buy and sell-back, nothing sent: tax, whether selling works, creator and top-10 holdings"],
  ["bridge_quote", "Bring ETH, USDC or USDT in from Base, Arbitrum, Ethereum, Optimism or BNB Chain, decoded before signing"],
  ["stock_tokens", "Robinhood Stock Tokens: Robinhood's price next to the on-chain price, liquidity, and whether Stoa routes them"],
  ["market_context", "Market context for a trade: BTC and ETH, total market, and up to 5 Robinhood Chain tokens"],
  ["spotlight", "This week's Spotlight: bids, votes, phase and closing times"],
  ["stock_gaps", "Stock tokens whose on-chain price is furthest from Robinhood's, with a 7-day gap history"],
  ["open_data", "Stoa's open datasets, and every routed swap, the Points board or venue quotes live"],
  ["list_tokens", "The tokens Stoa lists on a network, with addresses and decimals"],
];

const USED: { name: string; href: string; what: string }[] = [
  { name: "Nomad", href: "https://github.com/kadiri-seer/nomad/blob/main/docs/guides/stoa-setups.md", what: "Stoa's MCP tools built into the agent" },
  { name: "Autonomo", href: "https://autonomo.fun", what: "Stoa's safety check and swap quote as paid agent APIs (x402)" },
];

export default function AgentsPage() {
  return (
    <section className="page">
      <PageHead eyebrow="BUILD · AI AGENTS" title="Swaps for your agent, signed by its user">
        Your agent asks Stoa for a quote, checks the token, and gets an unsigned transaction back. The user&apos;s wallet signs; Stoa never holds keys or funds. No key and no account: 60 requests a minute.
      </PageHead>

      <div className="grid2 eq" style={{ alignItems: "start", marginBottom: 16 }}>
        <div className="panel pad">
          <div className="lbl">ADD THE MCP SERVER</div>
          <div className="box" style={{ marginTop: 10 }}><div className="row"><code style={{ fontFamily: "var(--mono)", fontSize: 13, overflowWrap: "anywhere" }}>{MCP}</code><CopyButton text={MCP} /></div></div>
          <p className="note">Claude, Cursor or any MCP client: add a remote (HTTP) server with this URL. In Claude Code:</p>
          <div className="box"><div className="row"><code style={{ fontFamily: "var(--mono)", fontSize: 12, overflowWrap: "anywhere" }}>{CLAUDE}</code><CopyButton text={CLAUDE} /></div></div>
          <p className="note" style={{ marginBottom: 0 }}><Link href="/docs/mcp">MCP docs</Link> · <a href="/skills/stoa/SKILL.md">Skill file</a></p>
        </div>
        <div className="panel pad">
          <div className="lbl">OR IN YOUR OWN CODE</div>
          <div className="box" style={{ marginTop: 10 }}><div className="row"><code style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{NPM}</code><CopyButton text={NPM} /></div></div>
          <p className="note">The same tools for the Vercel AI SDK, LangChain and OpenAI function calling. Set a <code>referrer</code> and your wallet earns 10% of Stoa&apos;s fee on the swaps your agent builds.</p>
          <p className="note" style={{ marginBottom: 0 }}>Plain HTTP: <code>GET stoadex.com/api/v1/quote</code> returns the route and, with a taker, the transaction. <Link href="/docs/api">API docs</Link></p>
        </div>
      </div>

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">TOOLS</div>
        <ul className="list prose">
          {TOOLS.map(([t, d]) => <li key={t}><span>{t}</span><b>{d}</b></li>)}
        </ul>
      </div>

      <div className="panel pad" style={{ marginBottom: 16 }}>
        <div className="lbl">THE SAFE ORDER</div>
        <ol style={{ margin: "10px 0 0", paddingLeft: 22, display: "grid", gap: 8, lineHeight: 1.5 }}>
          <li>Take the token&apos;s address from a trusted source, never from a name alone.</li>
          <li>Run <code>safety_check</code> and show the user the verdict.</li>
          <li>Show the user the quote: what they get, the minimum, the price impact.</li>
          <li>Build the swap and check that <code>tx.to</code> is the router on <Link href="/docs/contracts">Contracts</Link>.</li>
          <li>The user&apos;s wallet signs. Nothing is sent without it.</li>
        </ol>
      </div>

      <div className="panel pad">
        <div className="lbl">AGENTS ALREADY USING STOA</div>
        <ul className="list">
          {USED.map((u) => <li key={u.name}><a href={u.href} target="_blank" rel="noopener noreferrer">{u.name} ↗</a><b>{u.what}</b></li>)}
        </ul>
        <p className="note" style={{ marginBottom: 0 }}>Building one? Open an issue on <a href="https://github.com/StoaDex/Stoa" target="_blank" rel="noopener noreferrer">GitHub</a> and we&apos;ll add it here once it&apos;s live. Not financial advice; listed tokens are not reviewed by Stoa.</p>
      </div>
    </section>
  );
}

import { docsIndex, docPage } from "@/lib/docs";

// /llms.txt: a plain-text map of Stoa for AI assistants and search agents (llmstxt.org format).
export const dynamic = "force-static";

const SITE = "https://stoadex.com";
const plain = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "")
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

const PAGES: [string, string, string][] = [
  ["/trade", "Trade", "Swap on Robinhood Chain or Elysium; each swap is compared across every venue the router uses, for the exact amount"],
  ["/stocks", "Stock tokens", "Every Robinhood Stock Token on Robinhood Chain with Robinhood's own price next to the on-chain price and the gap"],
  ["/check", "Token safety check", "Paste a token address: a simulated buy and sell through the live router shows failed sells, taxes and holder concentration"],
  ["/spotlight", "Spotlight", "Three sponsored slots a week; projects bid ETH, $STOA holders lock and vote and share most of each winning bid"],
  ["/points", "Points", "Season 1 points for swaps and referrals; no promised value"],
  ["/report", "State of Robinhood Chain", "Weekly report: swaps through Stoa, stock token gaps, every venue quoted in one block"],
  ["/projects", "For token projects", "Token page, buy link, live safety badge, swap widget and Spotlight for a token"],
  ["/open", "Open source and data", "Source on GitHub, signed mirror on Twigpine, datasets on Hugging Face, export API, independent security review"],
  ["/status", "Status", "Live checks and 30-day uptime"],
  ["/build", "Integrate", "HTTP API and MCP server for bots and AI agents, no key"],
];

export function GET() {
  const lines: string[] = [
    "# Stoa",
    "",
    "> Stoa (stoadex.com) is a swap router on Robinhood Chain and Elysium. Every swap is compared across every venue the router uses (Uniswap V2, V3 and V4, Aero, Ramses, Pons curves, Metric and more), for the exact amount, and filled on the one that pays the most; it does not split orders. It also shows Robinhood Stock Token prices next to Robinhood's own price, runs a free token safety check, and has limit orders, Spotlight and Points. Fee: 2 bps. Not financial advice.",
    "",
    "## Main pages",
    ...PAGES.map(([p, t, d]) => `- [${t}](${SITE}${p}): ${d}`),
    "",
    "## For agents",
    `- [MCP server](${SITE}/mcp): tools for quotes, safety checks, stock token gaps, Spotlight and open data, no key (docs: ${SITE}/docs/mcp)`,
    `- [HTTP API](${SITE}/docs/api): /api/v1/quote, /api/v1/tokens, /api/v1/stocks, /api/v1/spotlight, /api/v1/export`,
    "",
  ];
  for (const g of docsIndex()) {
    lines.push(`## Docs: ${g.group}`);
    for (const p of g.pages) {
      let lead = "";
      try { lead = plain(docPage(p.slug)?.lead ?? "").slice(0, 220); } catch { /* missing page */ }
      lines.push(`- [${p.title}](${SITE}/docs/${p.slug})${lead ? `: ${lead}` : ""}`);
    }
    lines.push("");
  }
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, s-maxage=3600" } });
}

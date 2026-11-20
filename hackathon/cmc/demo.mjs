// Live demo of Stoa's MCP market_context tool (CoinMarketCap data) next to a real quote.
// No dependencies, no key: node demo.mjs [tokenAddress] [ethAmount]
const MCP = process.env.STOA_MCP ?? "https://stoadex.com/mcp";
const token = process.argv[2] ?? "0x13E6993417616De724F2b337D65063f229e96718"; // $STOA on Robinhood Chain
const eth = Number(process.argv[3] ?? "0.5");

let id = 0;
async function call(name, args) {
  const r = await fetch(MCP, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }),
  });
  const j = await r.json();
  if (j.error || j.result?.isError) throw new Error(JSON.stringify(j.error ?? j.result.content));
  return JSON.parse(j.result.content[0].text);
}

const ctx = await call("market_context", { tokens: [token] });
const q = await call("quote", { chain: "robinhood", sellToken: "native", buyToken: token, amount: BigInt(Math.round(eth * 1e18)).toString() });
console.log(JSON.stringify({ market_context: ctx, quote: q }, null, 2));

const t = ctx.tokens[0], m = ctx.market;
console.log(`\nMarket: Fear & Greed ${m.fearAndGreed?.value} (${m.fearAndGreed?.label}), crypto market ${m.marketCapChange24hPct}% in 24h, ETH $${m.ethUsd}`);
if (t.listedOnCmc) console.log(`${t.symbol}: market cap $${t.marketCapUsd}, liquidity $${t.liquidityUsd}, 24h volume $${t.last24h?.volumeUsd} (${t.last24h?.trades} trades)`);
const dec = 18;
console.log(`Quote: ${eth} ETH -> ${(Number(q.amountOut) / 10 ** dec).toLocaleString("en-US", { maximumFractionDigits: 0 })} ${t.symbol ?? "tokens"}, price impact ${q.priceImpactPct}%, route ${q.route?.legs?.map((l) => l.name).join(" + ") ?? "?"}`);

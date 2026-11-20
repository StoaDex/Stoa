import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { HyperliquidFeed, StaticFeed, type PriceFeed } from "./price.js";
import { MakerBot } from "./bot.js";

const c = loadConfig();
const feed: PriceFeed =
  c.priceSource === "static" ? new StaticFeed(c.staticMid, process.env.MID_FILE) : new HyperliquidFeed(c.hlCoin, c.hlHttp, c.hlWs);

await feed.start();
const bot = new MakerBot(c, feed);
await bot.init();
bot.start();

// health endpoint for uptime monitoring: GET /health
const server = createServer((req, res) => {
  const body = JSON.stringify(bot.stats, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  const healthy = !bot.stats.halted;
  res.writeHead(healthy ? 200 : 503, { "content-type": "application/json" });
  res.end(body);
}).listen(c.healthPort, "127.0.0.1");

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    if (stopping) return;
    stopping = true;
    await bot.stop(sig);
    feed.stop();
    server.close();
    process.exit(0);
  });
}

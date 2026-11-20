# Stoa maker bot

Quotes a Stoa pool every block from the Hyperliquid order book.

## What it does each block

1. Reads the latest HYPE mid from Hyperliquid (WebSocket `l2Book`, HTTP fallback).
2. Runs the risk checks below. If one fails it pulls the quote (`cancelQuote`) and waits.
3. Builds a quote:
   - **half-spread** = max(min, base + volatility × multiplier)
   - **centre** = mid shifted against the inventory imbalance (long base → lower prices)
   - **sizes** = min(side notional, share of inventory)
4. Sends `setQuote(bid, ask, bidSize, askSize, validBlocks)` with a priority fee so it lands before swaps in the same block.

## Risk controls

| Control | Default | Effect |
|---|---|---|
| Stale price | 1.5 s | stop quoting, pull quote |
| Price jump | 150 bps between ticks | 5 s cooldown, pull quote |
| Inventory | 80% of value on one side | stop adding to that side |
| Daily loss | $150 mark-to-market | halt until restart |
| Kill file | `./KILL` | pull quote and exit |
| SIGINT / SIGTERM | | pull quote and exit |

Quotes also expire on chain after 2 blocks, so a crashed bot stops quoting by itself.

## Run

```
npm install
cp .env.example .env    # fill RPC_URL, PRIVATE_KEY, POOL
npm run build
DRY_RUN=1 npm start     # logs quotes, sends nothing
npm start
```

Health: `curl 127.0.0.1:8787/health` (503 when halted).

The maker wallet must be approved in `MakerRegistry` and bonded (`bond(pool)` with HYPE). It only needs HYPE for gas; pool inventory sits in the pool.

On a VPS use `stoa-maker.service` (systemd, restarts on crash).

## Tests

```
npm test               # quoting and risk logic
./scripts/e2e.sh       # anvil: deploy contracts, run bot, swap, jump, kill switch (needs Foundry + ../contracts)
```

## Later

- Switch the price source to the Elysium HyperCore precompile once it ships.
- Hedge inventory on HyperCore.
- Gas budget alarm and alerts to Telegram/Discord.

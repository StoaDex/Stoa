# Stoa web app

The app at [stoadex.com](https://stoadex.com). Next.js 15 (App Router), wagmi and viem, three.js. One app for both networks: the network switcher (or `?chain=elysium|robinhood`) picks Elysium (99901) or Robinhood Chain (4663), and the app follows the wallet's chain.

| Route | What it does |
| --- | --- |
| `/` | "Walk the Stoa": scroll-driven 3D introduction |
| `/trade` | Swaps through `StoaRouter`: live quote over every venue, approve (exact amount by default), swap with slippage and a gas headroom, native coin in and out, wrap/unwrap, token import by address, Uniswap V4 pool registration, referrals from `?ref=`. Deep links: `/trade?chain=robinhood&sell=ETH&buy=0x…` |
| `/pools` | Elysium: the maker pool and its live quote. Robinhood Chain: the most liquid pools the router checks, verified on-chain, with DexScreener liquidity and volume |
| `/token` | $STOA: buyback & burn status and history, maker bonds (bond, unbond, withdraw) |
| `/earn` | LP vaults, closed until the external audit |
| `/curators`, `/build` | Curator guide, integration samples |
| `/referrals`, `/portfolio` | Referral link and claims, balances and swap history |
| `/admin` | Owner, Safe signer and guardian console: pause, venue proposals, timelocked Safe rounds |
| `/docs/*` | Rendered from [`content/docs`](content/docs) (GitBook format) |

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_RPC_URL` | Elysium RPCs, comma-separated, first is primary |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | Robinhood Chain RPCs for reads and transactions (defaults to the public RPC) |
| `NEXT_PUBLIC_ROBINHOOD_LOGS_RPC_URL` | Robinhood Chain RPC for `eth_getLogs`; keep the public one, free provider plans cap the block range |
| `NEXT_PUBLIC_WC_PROJECT_ID` | Reown (WalletConnect) project id; browser wallets work without it |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL |

Contract addresses come from `lib/deployments.json` (Elysium) and `lib/deployments-4663.json` (Robinhood Chain), which the deploy workflows commit. RPC keys set here are visible in the browser: restrict them to the site's domain in each provider's dashboard.

## Tests

```bash
npm test                 # swap helpers: amounts, slippage, routing kind, referral
npm run build            # type check and production build
./scripts/ui-e2e.sh      # anvil + contracts + built app + headless browser (needs Foundry and ../contracts)
```

## Deploy

Vercel project with root `web/`. Every push to `main` deploys to production.

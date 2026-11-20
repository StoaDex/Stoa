# Open data

Stoa publishes its public on-chain data as an open dataset on Hugging Face: [huggingface.co/datasets/StoaDex/stoa-onchain](https://huggingface.co/datasets/StoaDex/stoa-onchain). It is refreshed every 6 hours (00:23, 06:23, 12:23 and 18:23 UTC), and each week is tagged with its ISO week (for example `w2026-48`).

## Other datasets and the dashboard

- [StoaDex/robinhood-stock-tokens](https://huggingface.co/datasets/StoaDex/robinhood-stock-tokens): every Robinhood Stock Token four times a day, Robinhood's bid and ask next to the deepest on-chain price, the gap, liquidity and volume. One file per UTC day.
- [StoaDex/robinhood-chain-venue-quotes](https://huggingface.co/datasets/StoaDex/robinhood-chain-venue-quotes): a fixed basket of swaps quoted on every venue Stoa's router uses, all in one block, four times a day. Each venue alone, one hop, before fees, next to what Stoa's router returns after its 2 bps fee.
- [StoaDex/stoa-contracts](https://huggingface.co/datasets/StoaDex/stoa-contracts): contract source, ABIs, deployed addresses and security documents as one reproducible archive per release, with SHA-256 checksums and the Git commit. A new release only when any of it changes.
- [Dashboard](https://huggingface.co/spaces/StoaDex/stoa-dashboard): volume, stock token gaps and venue quotes, read from the datasets.

## Signed code mirror

The source is also mirrored to [Twigpine](https://explorer.twigpine.com/repos/z6Mkogs4MbcB3pBnpQygxpgWtt6LTJSCbmpiBhRBHgHvnMRt/stoa), a decentralized git network, on every push to `main`. Each push is signed with Stoa's Ed25519 key, `did:key:z6Mkogs4MbcB3pBnpQygxpgWtt6LTJSCbmpiBhRBHgHvnMRt`, so you can check the code matches without relying on GitHub. Clone it with `git clone https://node.gitlawb.com/z6Mkogs4MbcB3pBnpQygxpgWtt6LTJSCbmpiBhRBHgHvnMRt/stoa.git`.

## What is in stoa-onchain

| File | What it holds |
| --- | --- |
| `data/swaps.csv` | Every swap routed through Stoa on Robinhood Chain and Elysium: chain, time (UTC), transaction, tokens in and out with symbols and amounts, USD value as the Stats page values it, trader and referrer |
| `data/daily.csv` | Swaps and USD volume per UTC day and chain |
| `data/points_s1.csv` | The Points season 1 board: rank, wallet, points from swaps and from referrals, swaps counted |
| `data/spotlight.json` | The Spotlight week at the time of the update: rules, candidates with bids and votes, last week's winners |
| `manifest.json` | When it was generated, row counts and the SHA-256 of every file |

Everything in it is already public on-chain. Swaps come from the `Routed` events of Stoa's routers; Spotlight from SpotlightMarket's views. Nothing off-chain is added, and the "trader" is the address that received the output, as the chain records it.

## Verify an update

1. Download the update (the files at a week's tag).
2. Run `sha256sum data/*.csv data/spotlight.json` and compare with `manifest.json`.
3. To check the rows themselves, read the `Routed` events of the router addresses in [Admin and permissions](admin.md), or compare with the live export below.

## Live export

The same data is available live, without a key, from `https://stoadex.com/api/v1/export`:

- `?set=swaps`: every routed swap, oldest first
- `?set=points`: the Points season 1 board
- `?set=spotlight`: the Spotlight week in progress
- `?set=stocks`: every Robinhood Stock Token, Robinhood's price next to the on-chain price
- `?set=venues`: the venue-quote basket, read now (not cached)

The first four are cached for an hour.

## How it is built

A GitHub Actions job every 6 hours (`.github/workflows/open-data.yml`) runs `data/hf_publish.py`: it reads the export API, writes the files and the manifest, and uploads them to Hugging Face. The code for both is in the [public repository](https://github.com/StoaDex/Stoa). The dataset is licensed CC BY 4.0.

Not financial advice. Points have no promised value.

# Dune dashboard queries

SQL for Stoa's public Dune dashboard (Robinhood Chain), in DuneSQL. Each file is one query; paste it into a new
query on dune.com, run it, and add the chart named below to the dashboard.

| File | What it shows | Chart |
|---|---|---|
| 01_swaps_daily.sql | Swaps, traders and USD volume per day, plus cumulative volume | Bar: swaps and traders per day; line: cumulative volume |
| 02_top_pairs_7d.sql | Most swapped pairs over 7 days | Table |
| 03_stoa_burned_locked.sql | $STOA burned and locked in Spotlight over time | Area: total_burned; line: total_locked_spotlight |
| 04_stoa_holders.sql | Addresses holding $STOA now | Counter |
| 05_spotlight_bids.sql | Every Spotlight bid by week | Table |
| 06_buyback_burns.sql | Each weekly buy-and-burn | Table and counter (total_stoa_burned) |

Contracts: router 0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5, $STOA 0x13E6993417616De724F2b337D65063f229e96718,
SpotlightMarket 0xf3A995D4240c0F36da697E5292B294052a1706B5, StoaBuyback 0x2Eb53EBA6f04447d9ce03B4AfB421887239ae244.
The same numbers are on stoadex.com/stats, /token and /spotlight, and in the open datasets on Hugging Face.

# Maker kit

The maker bot Stoa runs itself, open source in the [`maker` folder of the repository](https://github.com/StoaDex/Stoa/tree/main/maker). It reads the Hyperliquid order book and quotes a Stoa pool every block.

- Quoting loop that updates when price moves past a threshold
- Max size per swap and inventory skew limits
- Spreads that widen automatically in volatile markets
- Daily loss limit and an emergency stop

Run it on an always-on server; makers need to post every block. Start with `DRY_RUN=1`, which logs the quotes it would send and sends nothing. The maker wallet only needs gas: the inventory sits in the pool. See [Become a maker](become-a-maker.md) for approval and the bond.

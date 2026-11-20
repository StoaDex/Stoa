# Ordering on Elysium

How transaction order affects makers and traders.

Elysium orders transactions inside each block by priority fee, with no privileged lanes. Makers therefore pay a slightly higher priority fee on quote updates so a fresh price lands before swaps in the same block.

For traders this means the quote you see is very likely the quote you get. Your slippage limit still protects you if a price changes between your signature and inclusion.

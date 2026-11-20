# LP tokens as collateral

Planned: use Stoa vault shares inside lending and other DeFi apps once vaults are live.

Because shares follow ERC-4626, a lending market can price them with `convertToAssets` and accept them as collateral. Integrators should read the share price from the vault, not from a DEX.

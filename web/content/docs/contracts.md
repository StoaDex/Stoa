# Contract addresses

All source code (contracts, tests, deploy scripts, this web app) is public at [github.com/StoaDex/Stoa](https://github.com/StoaDex/Stoa). Every deployed contract below is source-verified on Sourcify, so you can match the code on GitHub to what runs on-chain.

Stoa runs on two networks: Elysium and Robinhood Chain. Each has its own contracts, Safe and timelock.

## Elysium

Network tokens on Elysium and Stoa contracts, live on Elysium mainnet since block 5,216,650.

| Contract | Address |
| --- | --- |
| WHYPE | `0xbA876237B0F021A6c6D852d6c26E107997cC5E81` |
| USDC | `0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| StoaRouter | [`0x104752D50ef893da579Ad813918269e09Ea17dbA`](https://elysium.kinetiq.xyz/address/0x104752D50ef893da579Ad813918269e09Ea17dbA) |
| StoaPool (WHYPE/USDC) | [`0x7800220F420C63F5Ed5e60a75E864465ff49400a`](https://elysium.kinetiq.xyz/address/0x7800220F420C63F5Ed5e60a75E864465ff49400a) |
| MakerRegistry | [`0x9aC98F9dd7c796cF7d3544C945f9eB75AC56aDa0`](https://elysium.kinetiq.xyz/address/0x9aC98F9dd7c796cF7d3544C945f9eB75AC56aDa0) |
| FeeDistributor | [`0x19C1C6b5924C3257a03D29b2DB0Acd9d4492aD1e`](https://elysium.kinetiq.xyz/address/0x19C1C6b5924C3257a03D29b2DB0Acd9d4492aD1e) |
| UniswapV2Adapter | [`0x9c4b918a56Bb5328EEA59fDfc5805e87855363eF`](https://elysium.kinetiq.xyz/address/0x9c4b918a56Bb5328EEA59fDfc5805e87855363eF) |
| UniswapV3Adapter | [`0x3706B9467161B1c37915Df8f9B877Db60a9290F5`](https://elysium.kinetiq.xyz/address/0x3706B9467161B1c37915Df8f9B877Db60a9290F5) |
| UniswapV4Adapter | [`0xEB4BEC2795Ce314d1add4f8b3f2FCfBF38e892e5`](https://elysium.kinetiq.xyz/address/0xEB4BEC2795Ce314d1add4f8b3f2FCfBF38e892e5) |
| AeroAdapter | [`0x9C6c8c4fc598D46643b1c43D2660088F215C1fD8`](https://elysium.kinetiq.xyz/address/0x9C6c8c4fc598D46643b1c43D2660088F215C1fD8) |
| RamsesAdapter | [`0x78D5B6284D9D55b8c767571de2981259B66A548B`](https://elysium.kinetiq.xyz/address/0x78D5B6284D9D55b8c767571de2981259B66A548B) |
| LiquidityBookAdapter | [`0x2622d020AF94387a2A146B6a6F48209078f87172`](https://elysium.kinetiq.xyz/address/0x2622d020AF94387a2A146B6a6F48209078f87172) |

Outside venues the router uses: Uniswap V4 PoolManager `0xe2E105D3f7209A9da11F83ccf3E7398a753823F1`, Aero Slipstream factory `0xEfd7A089D3057F05189B05f74Ffcf30610c42891`, Ramses CL factory `0x29cd8852FF040CfE74fb20277A121eD1293AFb41`, Liquidity Book factory `0xF31632C73B8775e45Ce6d2539dEb008cB766D51b`, Uniswap V3 factory `0x1707327F626496A7b5b3872e7E4d2879Df7d7a9f` and Uniswap V2 factory `0xBbBcC62853a5fA27b93d6Bab3E6F7ce841E25Df2`.

Token addresses come from the [Elysium contract list](https://elysium.kinetiq.xyz/docs/contract-addresses). Always check an address here before approving it.

Every Stoa contract above is source-verified on the [Elysium explorer](https://elysium.kinetiq.xyz/address/0x104752D50ef893da579Ad813918269e09Ea17dbA) and on [Sourcify](https://repo.sourcify.dev/99901/0x104752D50ef893da579Ad813918269e09Ea17dbA), so anyone can read the code and check that the deployed bytecode matches it. The contracts are not upgradeable. New venues can be added to the router only after a public 24-hour wait. Who holds admin rights and what they can do is listed in [Admin and permissions](admin.md).

## Robinhood Chain

Stoa on Robinhood Chain (chain ID 4663), live since block 114,244,443. Same router code as on Elysium, with the Uniswap V2, V3 and V4 adapters. There are no maker pools on Robinhood Chain yet.

| Contract | Address |
| --- | --- |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| StoaRouter | [`0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5`](https://robinhoodchain.blockscout.com/address/0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5) |
| FeeDistributor | [`0x76c30317bB8C0bC47E2aC5D83b329FE9F386F4e7`](https://robinhoodchain.blockscout.com/address/0x76c30317bB8C0bC47E2aC5D83b329FE9F386F4e7) |
| MakerRegistry | [`0x350268AF3FE9995131F6C3970fc602DC24E0EE9D`](https://robinhoodchain.blockscout.com/address/0x350268AF3FE9995131F6C3970fc602DC24E0EE9D) |
| UniswapV2Adapter | [`0x5C8537e7d755884326dE0969Ce7BDb14195f56Be`](https://robinhoodchain.blockscout.com/address/0x5C8537e7d755884326dE0969Ce7BDb14195f56Be) |
| UniswapV3Adapter | [`0x28802Ad6F9859d14dfC6226eA9A8b60686D3A2E6`](https://robinhoodchain.blockscout.com/address/0x28802Ad6F9859d14dfC6226eA9A8b60686D3A2E6) |
| UniswapV4Adapter (the first V4 adapter; removed from the router on 19 Nov 2026) | [`0x8965140Fb51b2E99a0Cd31a0E99Eae01D36517B8`](https://robinhoodchain.blockscout.com/address/0x8965140Fb51b2E99a0Cd31a0E99Eae01D36517B8) |
| UniswapV4AdapterV2 (only the keeper or the owner registers pools; in the router since 19 Nov 2026, in place of UniswapV4Adapter) | [`0x27958279F95225b2a5517E7DD12b6Fc0317E5c5d`](https://robinhoodchain.blockscout.com/address/0x27958279F95225b2a5517E7DD12b6Fc0317E5c5d) |
| UniswapV4AdapterV3 (only the keeper or the owner registers pools, never evicts, each pool's quote simulation capped; deployed 18 Nov 2026, replaces UniswapV4AdapterV2 through the 48-hour timelock) | [`0xe0b9109ff2BafB145078522A9630acCbe84ce644`](https://robinhoodchain.blockscout.com/address/0xe0b9109ff2BafB145078522A9630acCbe84ce644) |
| MetricAdapter (Metric OMM pools, priced from each pool's live oracle; in the router since 19 Nov 2026) | [`0x1341DB53ed69cE1DeF86BDBfc60D5FD92Cf9004f`](https://robinhoodchain.blockscout.com/address/0x1341DB53ed69cE1DeF86BDBfc60D5FD92Cf9004f) |
| AeroAdapter | [`0xF0904B95D66f565De215cC7dc58B6054F72A9352`](https://robinhoodchain.blockscout.com/address/0xF0904B95D66f565De215cC7dc58B6054F72A9352) |
| RamsesAdapter | [`0x87b3B896beAbdC421F9d9B0A3FD3dBbAE1ddd568`](https://robinhoodchain.blockscout.com/address/0x87b3B896beAbdC421F9d9B0A3FD3dBbAE1ddd568) |
| PonsCurveAdapter | [`0x58c2C83b66088B57B9dd487Ba1090992Bc9eEbe0`](https://robinhoodchain.blockscout.com/address/0x58c2C83b66088B57B9dd487Ba1090992Bc9eEbe0) |
| StoaBuyback ($STOA buyback & burn, owns the FeeDistributor) | [`0x2Eb53EBA6f04447d9ce03B4AfB421887239ae244`](https://robinhoodchain.blockscout.com/address/0x2Eb53EBA6f04447d9ce03B4AfB421887239ae244) |
| BondRegistry ($STOA maker bonds) | [`0x7eD43F104f9317578806De89e9d478D297d468D4`](https://robinhoodchain.blockscout.com/address/0x7eD43F104f9317578806De89e9d478D297d468D4) |
| SpotlightMarket (weekly sponsored slots, paid to $STOA voters; deployed 15 Nov 2026 with CREATE2, [Sourcify](https://repo.sourcify.dev/4663/0xf3A995D4240c0F36da697E5292B294052a1706B5); week 1 opens 23 Nov 2026) | [`0xf3A995D4240c0F36da697E5292B294052a1706B5`](https://robinhoodchain.blockscout.com/address/0xf3A995D4240c0F36da697E5292B294052a1706B5) |
| RugCover (creator-bonded cover for Pons tokens, paid to covered buyers; address fixed by CREATE2, live once its code is there) | [`0x64498e94fEaC6750885818e5EE7921042395B301`](https://robinhoodchain.blockscout.com/address/0x64498e94fEaC6750885818e5EE7921042395B301) |
| StoaLimitV2 (limit orders filled through the router; live since 16 Nov 2026) | [`0xE42b3B429417182E8621F0d19A9a1dAdC31D1C12`](https://robinhoodchain.blockscout.com/address/0xE42b3B429417182E8621F0d19A9a1dAdC31D1C12) |
| StoaLimit (the first limit order contract, never used, replaced by StoaLimitV2) | [`0xf570F16D9dBcf6FF5fF8F2b6dF321ca4Fa4355B3`](https://robinhoodchain.blockscout.com/address/0xf570F16D9dBcf6FF5fF8F2b6dF321ca4Fa4355B3) |
| $STOA | [`0x13E6993417616De724F2b337D65063f229e96718`](https://robinhoodchain.blockscout.com/address/0x13E6993417616De724F2b337D65063f229e96718) |
| Admin Safe (2 of 3) | [`0xa1a495484536c52046d07209C60059cf9613D386`](https://robinhoodchain.blockscout.com/address/0xa1a495484536c52046d07209C60059cf9613D386) |
| Timelock (48h) | [`0xAC75133729d6B5d615aA696d0828dC31fcB83ed8`](https://robinhoodchain.blockscout.com/address/0xAC75133729d6B5d615aA696d0828dC31fcB83ed8) |

Outside venues the router uses there: Uniswap V2 factory `0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f`, Uniswap V3 factory `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` and Uniswap V4 PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951`. The V4 adapter accepts pools with no hook, Pons V2 pools and the pools of four other hooks that passed a live buy-and-sell test before deployment.

The Aero and Ramses adapters were deployed on 15 November 2026 for Aero Slipstream (factory `0xc63d7338c178e805c544B8f897066bD3BBcBE136`) and Ramses V3 (factory `0xE0c4ceb92d08CA985bB70fe0a22fEb121A9854A8`). They have no owner. The admin Safe added them to the router through the 48-hour timelock and the router's 24-hour wait, and they have been live since 18 November 2026.

The Pons curve adapter was deployed on 15 November 2026 for tokens still on their Pons bonding curve (Pons factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`). It trades only curves the Pons factory registered, quoted in ETH, and quotes with the curve's own pricing: Pons' 1% fee plus the token's creator tax, then the curve's x·y=k math, matched to the wei on the live $STOA curve and four other live curves before deployment. It leaves the buy that would graduate a curve to Pons. It has no owner. The admin Safe added it to the router through the 48-hour timelock and the router's 24-hour wait, and it has been live since 18 November 2026.

Every Stoa contract on Robinhood Chain is source-verified on [Sourcify](https://repo.sourcify.dev/4663/0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5) (exact match).

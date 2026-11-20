# Router and SDK

Quote and swap from your own app or contract. The router is the same code on both networks; only the addresses change.

| | Elysium (99901) | Robinhood Chain (4663) |
| --- | --- | --- |
| StoaRouter | `0x104752D50ef893da579Ad813918269e09Ea17dbA` | `0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5` |
| Native coin (use the zero address) | HYPE | ETH |
| Hop token | WHYPE `0xbA876237B0F021A6c6D852d6c26E107997cC5E81` | WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |
| Main stablecoin | USDC `0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65` (6 decimals) | USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (6 decimals) |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

## Quote

`quote` returns the best route: the amount out (after all fees), and the venue for each leg. It simulates swaps, so call it with `eth_call` (in viem, `simulateContract`). Use the zero address for the native coin (HYPE or ETH). The examples use Elysium's tokens; on Robinhood Chain swap in WETH and USDG.

```ts
const { result: route } = await client.simulateContract({
  address: ROUTER, abi: routerAbi,
  functionName: 'quote',
  args: [USDC, WHYPE, 250_000_000n],
})
// route.amountOut, route.mid (zero = direct), route.leg1, route.leg2
```

## Swap

Pass the route back with your limits. The router only accepts venues on its allowlist and checks what the recipient actually receives.

```ts
await wallet.writeContract({
  address: ROUTER, abi: routerAbi, functionName: 'swap',
  args: [{
    tokenIn: USDC, tokenOut: WHYPE,
    mid: route.mid, leg1: route.leg1, leg2: route.leg2,
    amountIn: 250_000_000n,
    minOut: route.amountOut * 995n / 1000n, // 0.5% slippage
    to: account, deadline, referrer: zeroAddress,
  }],
  // value: amountIn when tokenIn is the native coin (HYPE or ETH)
})
```

## Permit2

`swapWithPermit2(params, permit, signature)` pulls the input with a [Permit2](https://docs.uniswap.org/contracts/permit2/overview) signature instead of an approval to the router. The permit must be signed by the caller, for the same token, with the router as spender.

{% hint style="info" %}

A typed SDK package will follow. Until then, use viem or ethers with the router ABI: download it from [stoadex.com/abi/StoaRouter.json](https://stoadex.com/abi/StoaRouter.json), or take it from the verified source on Sourcify ([Elysium](https://repo.sourcify.dev/99901/0x104752D50ef893da579Ad813918269e09Ea17dbA), [Robinhood Chain](https://repo.sourcify.dev/4663/0x2F2804fad735a38015650f32f95Ad5E08D6B3eE5)).

{% endhint %}

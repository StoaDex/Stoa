import { NETS, netByKey } from "@/lib/networks";
import { NATIVE } from "@/lib/tokens";
import { API_HEADERS, apiError, limited } from "@/lib/api";

// GET /api/v1/tokens?chain=robinhood — the tokens Stoa lists on a network (any other token address can still be quoted)
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const block = limited(req);
  if (block) return block;
  const key = new URL(req.url).searchParams.get("chain");
  const nets = key ? [netByKey(key)].filter((n) => !!n) : NETS.filter((n) => n.deployed);
  if (key && !nets.length) return apiError(400, "chain must be robinhood or elysium");
  return Response.json({
    chains: nets.map((n) => ({
      chain: n!.key, chainId: n!.chain.id, router: n!.contracts.router ?? null, native: { symbol: n!.gas, address: "native", wrapped: n!.wrapped },
      tokens: n!.tokens.filter((t) => t.address !== NATIVE).map((t) => ({ address: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals })),
    })),
  }, { headers: { ...API_HEADERS, "cache-control": "public, s-maxage=300" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: API_HEADERS });
}

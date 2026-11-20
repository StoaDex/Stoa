import "server-only";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { createPublicClient, fallback, http, isAddress, parseAbi, type Address, type PublicClient } from "viem";
import { ROBINHOOD } from "./networks";
import { srv } from "@/lib/serverRpc";
import { STOA_RH } from "./anychain";
import { SOURCES, SOURCE_RPCS } from "./bridge";
import { computeGuard, guardRoute, type Guard } from "./v4guard";

/** Stoa's signature of a quote it issued: the Trustware intent id, the buyer, the source chain and the Relay order id
 *  in the deposit call. /status and /receipt only act on quotes that carry it, so ids Stoa never issued never reach
 *  Trustware, and a receipt can only commit a transaction from that buyer carrying that order id. Keyed from its own
 *  secret (ANYCHAIN_HMAC_SECRET) so rotating the Trustware key does not drop purchases in flight; derived from the
 *  Trustware key only when that secret is not set. */
function key() {
  const own = process.env.ANYCHAIN_HMAC_SECRET;
  // a secret that is set but too short is a mistake: fail loudly rather than fall back to the Trustware-derived key
  if (own !== undefined && own !== "" && own.length < 32) throw new Error("ANYCHAIN_HMAC_SECRET must be at least 32 characters");
  if (own) return createHash("sha256").update(`stoa-anychain-ticket:${own}`).digest();
  const k = process.env.TRUSTWARE_API_KEY;
  if (!k) throw new Error("not configured");
  return createHash("sha256").update(`stoa-anychain-intent:${k}`).digest();
}
export interface Ticket { intentId: string; user: string; chainId: number; depositId: string; exp: number }
/** how long a quote's ticket lets /status and /receipt act on it (the page follows a purchase for up to 45 minutes) */
export const TICKET_TTL_S = 3 * 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function signTicket(t: Ticket) {
  return createHmac("sha256", key()).update(`${t.intentId.toLowerCase()}|${t.user.toLowerCase()}|${t.chainId}|${t.depositId.toLowerCase()}|${t.exp}`).digest("hex");
}
/** a ticket from a request (query or JSON body), or null when it is malformed or not Stoa's */
export function readTicket(v: { intentId?: unknown; user?: unknown; chainId?: unknown; depositId?: unknown; exp?: unknown; sig?: unknown }): Ticket | null {
  const t: Ticket = { intentId: String(v.intentId ?? ""), user: String(v.user ?? ""), chainId: Number(v.chainId), depositId: String(v.depositId ?? ""), exp: Number(v.exp) };
  if (!Number.isSafeInteger(t.exp) || t.exp < Math.floor(Date.now() / 1000)) return null; // expired tickets do nothing
  const sig = String(v.sig ?? "");
  if (!UUID.test(t.intentId) || !isAddress(t.user, { strict: false }) || !SOURCES.some((s) => s.chain.id === t.chainId)) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(t.depositId) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  try {
    return timingSafeEqual(Buffer.from(signTicket(t), "hex"), Buffer.from(sig, "hex")) ? t : null;
  } catch {
    return null;
  }
}
/** true when a JSON body was sent as JSON (a text/plain body from another site's page is refused) */
export const isJson = (req: Request) => (req.headers.get("content-type") ?? "").toLowerCase().split(";")[0].trim() === "application/json";

/** a read-only client for a source chain */
export function sourceClient(chainId: number) {
  const s = SOURCES.find((x) => x.chain.id === chainId)!;
  const ua = { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 8_000 };
  return createPublicClient({ chain: s.chain, transport: fallback((SOURCE_RPCS[chainId] ?? []).map((u) => http(u, ua))) });
}

const routerAbi = parseAbi(["function quote(address,address,uint256) returns ((uint256 amountOut, address mid, (address venue, bool isPool) leg1, (address venue, bool isPool) leg2))"]);
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/** The V4 guard, quickly: Stoa's own /api/v1/v4-guard answer (cached at the edge for a minute) when it is a real one,
 *  else computed here within 6 s; otherwise it rejects, and the caller treats every pair as suspect. */
async function guardFast(): Promise<Guard> {
  try {
    const r = await fetch("https://stoadex.com/api/v1/v4-guard", { signal: AbortSignal.timeout(3_000), headers: { "user-agent": "stoa-server" } });
    const g = (await r.json()) as Guard;
    if (r.ok && Array.isArray(g.poisoned) && !g.poisoned.includes("*") && typeof g.oldInRouter === "boolean") return g;
  } catch { /* compute it */ }
  return Promise.race([computeGuard(), new Promise<Guard>((_, no) => setTimeout(() => no(new Error("slow")), 6_000))]);
}

/** Stoa's own prices from its router on Robinhood Chain: USD per ETH (0.01 ETH → USDG) and $STOA per USD (10 USDG →
 *  $STOA). Either is null when the chain does not answer. */
export async function stoaPrices(): Promise<{ ethUsd: number | null; stoaPerUsd: number | null }> {
  const rpc = (ROBINHOOD.chain.rpcUrls.default.http as readonly string[])[0] ?? ROBINHOOD.logsRpc;
  const c = createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(rpc), { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 8_000 }) });
  const router = ROBINHOOD.contracts.router!;
  const [e, s, g] = await Promise.allSettled([
    c.simulateContract({ address: router, abi: routerAbi, functionName: "quote", args: [ZERO, USDG, 10n ** 16n] }),
    c.simulateContract({ address: router, abi: routerAbi, functionName: "quote", args: [USDG, STOA_RH, 10n * 10n ** 6n] }),
    guardFast(),
  ]);
  // the ETH price goes through the same V4 guard as every other Stoa quote (lib/v4guard). When the guard can't be
  // read in time, every pair counts as suspect and the price is read without the first V4 adapter, as /api/v1/quote does.
  const guard: Guard = g.status === "fulfilled" ? g.value : { oldInRouter: true, poisoned: ["*"] };
  let ethUsd: number | null = null;
  if (e.status === "fulfilled") {
    const r = await guardRoute(c as unknown as PublicClient, ROBINHOOD, ZERO, USDG, 10n ** 16n, e.value.result, guard).catch(() => null);
    if (r && r.amountOut > 0n) ethUsd = (Number(r.amountOut) / 1e6) * 100;
  }
  let stoaPerUsd: number | null = null;
  if (s.status === "fulfilled") {
    const r = await guardRoute(c as unknown as PublicClient, ROBINHOOD, USDG, STOA_RH, 10n * 10n ** 6n, s.value.result, guard).catch(() => null);
    if (r && r.amountOut > 0n) stoaPerUsd = Number(r.amountOut) / 1e18 / 10;
  }
  return { ethUsd, stoaPerUsd };
}

const decimalsAbi = parseAbi(["function decimals() view returns (uint8)"]);
/** ETH -> token on Robinhood Chain through Stoa's router, behind the same V4 guard as every other Stoa quote, plus the
 *  token's decimals. null when there is no route. */
export async function ethToTokenRoute(token: Address, ethIn: bigint) {
  const rpc = (ROBINHOOD.chain.rpcUrls.default.http as readonly string[])[0] ?? ROBINHOOD.logsRpc;
  const c = createPublicClient({ chain: ROBINHOOD.chain, transport: http(srv(rpc), { fetchOptions: { headers: { "user-agent": "curl/8.5.0" } }, timeout: 8_000 }) });
  const router = ROBINHOOD.contracts.router!;
  const [q, g, d] = await Promise.allSettled([
    c.simulateContract({ address: router, abi: routerAbi, functionName: "quote", args: [ZERO, token, ethIn] }),
    guardFast(),
    c.readContract({ address: token, abi: decimalsAbi, functionName: "decimals" }),
  ]);
  if (q.status !== "fulfilled" || d.status !== "fulfilled") return null;
  const guard: Guard = g.status === "fulfilled" ? g.value : { oldInRouter: true, poisoned: ["*"] };
  const r = await guardRoute(c as unknown as PublicClient, ROBINHOOD, ZERO, token, ethIn, q.value.result, guard).catch(() => null);
  if (!r || r.amountOut <= 0n) return null;
  return { route: r, decimals: Number(d.value) };
}

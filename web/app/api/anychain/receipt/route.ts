import { type Hash } from "viem";
import { tw } from "@/lib/trustware";
import { limited } from "@/lib/api";
import { isJson, readTicket, sourceClient } from "@/lib/anychainServer";
import { RELAY_DEPOSITORY, depositIdOf } from "@/lib/anychain";
import { sameAddr } from "@/lib/bridge";

// POST /api/anychain/receipt {intentId, user, chainId, depositId, sig, txHash}: tells Trustware which source
// transaction filled a route intent Stoa issued, so its status (and Relay's delivery) can be followed. Only a
// transaction sent by that buyer, to Relay's Depository, carrying that intent's order id is accepted, so nobody can
// commit someone else's deposit to an intent of their own. Retrying the same hash is safe (Idempotency-Key).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const slow = limited(req);
  if (slow) return slow;
  if (!isJson(req)) return Response.json({ error: "bad request" }, { status: 415 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const txHash = String(b?.txHash ?? "");
  if (!b || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return Response.json({ error: "bad request" }, { status: 400 });
  const t = readTicket(b);
  if (!t) return Response.json({ error: "unknown intent" }, { status: 403 });
  // the transaction itself, on the source chain: not visible yet answers 409 and the page tries again
  const tx = await sourceClient(t.chainId).getTransaction({ hash: txHash as Hash }).catch(() => null);
  if (!tx) return Response.json({ error: "not found yet" }, { status: 409 });
  if (!sameAddr(tx.from, t.user) || !tx.to || !sameAddr(tx.to, RELAY_DEPOSITORY) || (depositIdOf(tx.input) ?? "").toLowerCase() !== t.depositId.toLowerCase()) {
    return Response.json({ error: "not this purchase" }, { status: 400 });
  }
  const r = await tw(`/route-intent/${t.intentId}/receipt`, { method: "POST", body: JSON.stringify({ txHash }), idem: txHash });
  return Response.json({ ok: r.ok }, { status: r.ok ? 200 : 502 });
}

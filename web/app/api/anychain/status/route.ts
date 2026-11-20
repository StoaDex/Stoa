import { tw } from "@/lib/trustware";
import { limited } from "@/lib/api";
import { readTicket } from "@/lib/anychainServer";

// GET /api/anychain/status?intentId=…&user=…&chainId=…&depositId=…&sig=…: Trustware's status for a route intent Stoa
// issued (pending, submitted, bridging, success, failed, expired) and the delivery transaction on Robinhood Chain once
// there is one.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const slow = limited(req);
  if (slow) return slow;
  const t = readTicket(Object.fromEntries(new URL(req.url).searchParams));
  if (!t) return Response.json({ error: "unknown intent" }, { status: 403 });
  const r = await tw(`/route-intent/${t.intentId}/status`);
  if (!r.ok) return Response.json({ status: "unknown" }, { status: r.status === 404 ? 404 : 502 });
  const d = (r.body.data ?? {}) as Record<string, unknown>;
  const s = String(d.status ?? "unknown");
  const raw = typeof d.dest_tx_hash === "string" ? d.dest_tx_hash : typeof d.destTxHash === "string" ? d.destTxHash : null;
  const dest = raw && /^0x[0-9a-fA-F]{64}$/.test(raw) ? raw : null;
  return Response.json({ status: s, destTx: dest }, { headers: { "cache-control": "no-store" } });
}

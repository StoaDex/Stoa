import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { questProgress, stoaOf } from "@/lib/wrapped";
import { stoaPrices } from "@/lib/anychainServer";
import { QUEST } from "@/lib/quest";

// POST /api/quest/zealy?task=swap|lock|hold, for Zealy's API task. Zealy posts { userId, communityId, subdomain, questId,
// requestId, accounts: { wallet } } and reads only the status: 200 = task done, 400 = not yet, with { message } shown to
// the user. Read-only and about public chain data, so no API key.
export const runtime = "nodejs";
export const maxDuration = 10;

const no = (message: string) => NextResponse.json({ message }, { status: 400 });

export async function POST(req: Request) {
  const task = new URL(req.url).searchParams.get("task");
  if (task !== "swap" && task !== "lock" && task !== "hold") return no("This task is set up with an unknown check. Tell the Stoa team.");
  let wallet = "";
  try { wallet = String(((await req.json()) as { accounts?: { wallet?: string } })?.accounts?.wallet ?? "").trim(); } catch { /* below */ }
  if (!isAddress(wallet)) return no("Connect an EVM wallet to Zealy first, then claim again.");
  if (task === "hold") return hold(wallet);
  try {
    const p = await Promise.race([
      questProgress(wallet, QUEST.start, QUEST.end, QUEST.minUsd),
      new Promise<null>((_, rej) => setTimeout(() => rej(new Error("slow")), 8_500)),
    ]);
    if (!p) return no("That wallet address is not valid.");
    if (task === "swap") {
      return p.qualifying > 0
        ? NextResponse.json({ message: `Done: ${p.qualifying} swap${p.qualifying > 1 ? "s" : ""} of $${QUEST.minUsd}+ through Stoa.` })
        : no(`No swap of $${QUEST.minUsd} or more through Stoa on Robinhood Chain from this wallet since the quest opened. Swap on stoadex.com/trade, wait a minute, then claim again.`);
    }
    return p.locked > 0
      ? NextResponse.json({ message: `Done: ${Math.floor(p.locked).toLocaleString("en-US")} $STOA locked.` })
      : no("No $STOA locked from this wallet yet. Lock any amount on stoadex.com/spotlight, then claim again.");
  } catch {
    return no("Robinhood Chain did not answer in time. Wait a minute and claim again.");
  }
}

// hold: $STOA in the wallet plus $STOA locked in Spotlight or Rug Cover, worth at least QUEST.holdUsd at Stoa's own
// router price (10 USDG -> $STOA). Checked at the moment the user claims.
async function hold(wallet: string) {
  try {
    const [s, px] = await Promise.race([
      Promise.all([stoaOf(getAddress(wallet)), stoaPrices()]),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("slow")), 8_500)),
    ]);
    if (!px.stoaPerUsd) return no("Could not read the $STOA price right now. Wait a minute and claim again.");
    const total = s.held + s.locked, need = QUEST.holdUsd * px.stoaPerUsd, usd = total / px.stoaPerUsd;
    const fmt = (n: number) => Math.ceil(n).toLocaleString("en-US");
    return total >= need
      ? NextResponse.json({ message: `Done: ${fmt(total)} $STOA (about $${usd.toFixed(2)}) held${s.locked > 0 ? " incl. locked" : ""}.` })
      : no(`This wallet holds ${fmt(total)} $STOA (about $${usd.toFixed(2)}). Hold at least $${QUEST.holdUsd} of $STOA (about ${fmt(need)} $STOA) on Robinhood Chain, then claim again. Buy on stoadex.com/trade.`);
  } catch {
    return no("Robinhood Chain did not answer in time. Wait a minute and claim again.");
  }
}

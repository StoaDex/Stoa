import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { questProgress } from "@/lib/wrapped";
import { QUEST } from "@/lib/quest";

// GET /api/quest?address=0x…[&task=swap|lock]
// For Galxe's API credential: `done` is 1 when the task is complete, else 0. Without `task`, every task's state.
//   swap: at least one swap through Stoa on Robinhood Chain worth $10 or more since the quest opened
//   lock: any $STOA locked in Spotlight (or backing Rug Cover)
export const runtime = "nodejs";
export const maxDuration = 30;

const head = { "cache-control": "public, s-maxage=60, stale-while-revalidate=120", "access-control-allow-origin": "*" };

export async function GET(req: Request) {
  const u = new URL(req.url);
  const address = (u.searchParams.get("address") ?? "").trim();
  const task = u.searchParams.get("task");
  if (!isAddress(address)) return NextResponse.json({ error: "address must be a 0x address" }, { status: 400, headers: head });
  if (task && task !== "swap" && task !== "lock") return NextResponse.json({ error: "task must be swap or lock" }, { status: 400, headers: head });
  try {
    const p = await questProgress(address, QUEST.start, QUEST.end, QUEST.minUsd);
    if (!p) return NextResponse.json({ error: "bad address" }, { status: 400, headers: head });
    const swap = p.qualifying > 0 ? 1 : 0, lock = p.locked > 0 ? 1 : 0;
    const body = { address: p.address, quest: QUEST.name, start: QUEST.start, end: QUEST.end, swap, lock, swaps: p.swaps, qualifyingSwaps: p.qualifying, lockedStoa: Math.floor(p.locked) };
    return NextResponse.json(task ? { ...body, task, done: task === "swap" ? swap : lock } : body, { headers: head });
  } catch {
    return NextResponse.json({ error: "chain read failed, try again in a minute" }, { status: 503, headers: { ...head, "cache-control": "no-store" } });
  }
}

import "server-only";

const DS = "https://huggingface.co/datasets/StoaDex/robinhood-stock-tokens/resolve/main/data";
export type GapPoint = { t: number; mid: number; onchain: number; gap: number };

function parse(csv: string) {
  const lines = csv.trim().split("\n");
  const head = lines.shift()?.split(",") ?? [];
  const ix = (k: string) => head.indexOf(k);
  const [iT, iA, iB, iK, iO, iH] = [ix("snapshot_utc"), ix("address"), ix("robinhood_bid"), ix("robinhood_ask"), ix("onchain_price"), ix("halted")];
  // names can hold quoted commas, so fields after "name" are read from the right when a row has extra commas
  return lines.map((l) => {
    const f = l.split(",");
    const extra = f.length - head.length;
    const at = (i: number) => (i > ix("name") ? f[i + extra] : f[i]);
    return { t: Date.parse(at(iT)) / 1000, address: (at(iA) ?? "").toLowerCase(), bid: Number(at(iB)), ask: Number(at(iK)), onchain: Number(at(iO)), halted: at(iH) === "True" };
  });
}

/** Robinhood's mid price and the on-chain price of one stock token, every snapshot (4 a day) of the last 7 days, from
 *  Stoa's open dataset on Hugging Face. Each day's file is cached for an hour. Empty when the dataset has no rows yet. */
export async function gapHistory(address: string): Promise<GapPoint[]> {
  const a = address.toLowerCase();
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)).reverse();
  const files = await Promise.all(days.map((d) => fetch(`${DS}/${d.slice(0, 7)}/${d}.csv`, { next: { revalidate: 3600 } }).then((r) => (r.ok ? r.text() : "")).catch(() => "")));
  const out: GapPoint[] = [];
  for (const f of files) {
    if (!f) continue;
    for (const r of parse(f)) {
      if (r.address !== a || r.halted || !(r.bid > 0) || !(r.ask > 0) || !(r.onchain > 0) || !Number.isFinite(r.t)) continue;
      const mid = (r.bid + r.ask) / 2;
      out.push({ t: r.t, mid, onchain: r.onchain, gap: ((r.onchain - mid) / mid) * 100 });
    }
  }
  return out.sort((x, y) => x.t - y.t);
}

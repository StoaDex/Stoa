import { readSupply, units } from "@/lib/stoaSupply";

// read on request and kept by the CDN for a minute (a 5-minute ISR page served whatever the previous visitor got)
export const dynamic = "force-dynamic";
const CACHE = { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" };

/** plain number, the format CoinGecko and CoinMarketCap read */
export async function GET() {
  try {
    const s = await readSupply();
    return new Response(units(s.total), { headers: { "content-type": "text/plain; charset=utf-8", ...CACHE } });
  } catch {
    return new Response("unavailable", { status: 503 });
  }
}

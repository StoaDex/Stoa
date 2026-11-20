import { isAddress } from "viem";
import { netByKey } from "@/lib/networks";
import { readSafety, type Safety } from "@/lib/safety";

// GET /badge/safety/<chain>/<token>: a small SVG badge with the token's live Stoa safety check (a simulated buy and
// sell through the router), for a project's website or README. Wrap it in a link to /check/<chain>/<token>.
// Re-checked at most every 30 minutes; it says "not tested" rather than guessing.
export const dynamic = "force-dynamic";

const LOOK: Record<Safety["verdict"], { text: string; color: string }> = {
  ok: { text: "buy and sell OK", color: "#15803d" },
  caution: { text: "caution", color: "#b45309" },
  danger: { text: "sell failed", color: "#b91c1c" },
  unknown: { text: "not tested", color: "#6b7280" },
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
// rough width of 11px Verdana-like text
const w = (s: string) => Math.round(s.length * 6.4 + 14);

function svg(label: string, text: string, color: string, title: string) {
  const a = w(label), b = w(text);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${a + b}" height="20" role="img" aria-label="${esc(`${label}: ${text}`)}"><title>${esc(title)}</title><rect width="${a}" height="20" rx="3" fill="#16202e"/><rect x="${a}" width="${b}" height="20" rx="3" fill="${color}"/><rect x="${a}" width="4" height="20" fill="${color}"/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11"><text x="7" y="14">${esc(label)}</text><text x="${a + 7}" y="14">${esc(text)}</text></g></svg>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ chain: string; token: string }> }) {
  const { chain, token } = await params;
  const net = netByKey(chain);
  const headers = { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, s-maxage=1800, stale-while-revalidate=3600" };
  if (!net || !isAddress(token, { strict: false })) return new Response(svg("Stoa safety check", "unknown token", "#6b7280", "Not a token address"), { headers, status: 400 });
  try {
    const s = await readSafety(net, token);
    const l = LOOK[s.verdict];
    const taxPct = Math.max(s.test?.buyTaxPct ?? 0, s.test?.sellTaxPct ?? 0);
    const tax = s.verdict !== "danger" && taxPct > 0.5 ? ` · tax ${taxPct.toFixed(1)}%` : "";
    const when = new Date(s.checkedAt * 1000).toISOString().slice(0, 16).replace("T", " ");
    return new Response(svg("Stoa safety check", l.text + tax, l.color, `Simulated buy and sell through Stoa's router, ${when} UTC. A pass describes the token at that time.`), { headers });
  } catch {
    return new Response(svg("Stoa safety check", "try later", "#6b7280", "The chain did not answer"), { headers: { ...headers, "cache-control": "public, s-maxage=60" } });
  }
}

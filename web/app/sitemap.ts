import type { MetadataRoute } from "next";
import { SITE } from "@/lib/chain";
import { flatDocs } from "@/lib/docs";
import { CA } from "@/lib/stoaAddress";
import type { Launch } from "@/lib/ponsLaunch";
import { listedTokens } from "@/lib/tokenInfo";
import { stockTokens } from "@/lib/stocks";

const PAGES = ["", "/trade", "/pools", "/earn", "/curators", "/token", "/build", "/referrals", "/changelog", "/launches", "/stats", "/tokens", "/stocks", "/check", "/spotlight", "/cover", "/wrapped", "/security", "/guides", "/bridge", "/weekly", "/spotlight/projects", "/build/widget", "/status", "/points", "/agents", "/open", "/report", "/start", "/projects", "/press", "/makers", "/pay"];
/** pages whose numbers change every day */
const DAILY = new Set(["", "/trade", "/launches", "/stats", "/tokens", "/stocks", "/spotlight", "/token", "/weekly"]);
/** rebuilt every hour: the token pages of the launches closest to graduation and the latest graduations */
export const revalidate = 3600;

async function launchPages(): Promise<string[]> {
  try {
    const r = await fetch(`${SITE}/api/pons/launches`, { signal: AbortSignal.timeout(8_000) });
    const d = (await r.json()) as { launches?: Launch[] };
    const all = d.launches ?? [];
    const live = all.filter((l) => !l.graduated).sort((a, b) => b.progress - a.progress).slice(0, 40);
    const grads = all.filter((l) => l.graduated);
    return [...live, ...grads].map((l) => l.token);
  } catch {
    return []; // the API is slow or down: the static pages still go out
  }
}

/** the docs pages; a missing docs folder must not take the whole sitemap down */
function docPages() {
  try {
    return flatDocs();
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.replace(/\/$/, "");
  const tokens = [...new Set([CA, ...(await launchPages())])];
  const stocks = (await stockTokens().catch(() => null))?.stocks ?? [];
  return [
    ...PAGES.map((p) => ({ url: `${base}${p}`, changeFrequency: DAILY.has(p) ? ("daily" as const) : ("weekly" as const), priority: p === "" ? 1 : p === "/trade" ? 0.9 : 0.7 })),
    ...docPages().map((d) => ({ url: `${base}/docs/${d.slug}`, changeFrequency: "monthly" as const, priority: 0.5 })),
    ...tokens.map((t) => ({ url: `${base}/launches/${t}`, changeFrequency: "hourly" as const, priority: t === CA ? 0.7 : 0.4 })),
    ...stocks.map((s) => ({ url: `${base}/stocks/${s.symbol.toLowerCase()}`, changeFrequency: "daily" as const, priority: s.route ? 0.6 : 0.4 })),
    ...listedTokens().map(({ net, token }) => ({ url: `${base}/tokens/${net.key}/${token.address}`, changeFrequency: "daily" as const, priority: 0.5 })),
  ];
}

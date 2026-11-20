// Pons token logos (IPFS), served from stoadex.com so visitors never hit an IPFS gateway themselves (rate limits,
// tracking) and the CDN keeps each one forever (an IPFS CID is content-addressed, so it never changes).
// Raster images only, sniffed from the bytes: SVG and anything else is refused, so nothing can run on our origin.
import { getAddress, isAddress } from "viem";
import { curveOf, logoUrl, ponsLogoAbi, rhClient } from "@/lib/ponsLaunch";

const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,120})$/;
const GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"];
const MAX = 2_000_000;

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** CIDs we serve: only logos of tokens on the Launches list (read from our own CDN-cached API, refreshed each minute) */
let allowed: { at: number; set: Set<string> } | null = null;
async function isListed(origin: string, cid: string) {
  if (!allowed || Date.now() - allowed.at > 60_000) {
    try {
      const d = (await (await fetch(`${origin}/api/pons/launches`, { signal: AbortSignal.timeout(15_000) })).json()) as { launches?: { logo: string | null }[] };
      const set = new Set((d.launches ?? []).map((l) => l.logo?.split("/").pop() ?? "").filter(Boolean));
      if (set.size) allowed = { at: Date.now(), set };
    } catch { /* keep the previous list */ }
  }
  return !!allowed?.set.has(cid);
}

/** ...or the logo a Pons token itself points to: /api/pons/logo/<cid>?t=<token> (token pages), checked on chain */
const owned = new Map<string, boolean>();
async function isTokenLogo(cid: string, t: string | null) {
  if (!t || !isAddress(t, { strict: false })) return false;
  const token = getAddress(t), key = `${token}:${cid}`;
  if (owned.has(key)) return owned.get(key)!;
  try {
    const c = rhClient();
    const [curve, logo] = await Promise.all([curveOf(token, c), c.readContract({ address: token, abi: ponsLogoAbi, functionName: "logo" })]);
    const ok = !!curve && logoUrl(logo) === `/api/pons/logo/${cid}`;
    if (owned.size > 5000) owned.clear();
    owned.set(key, ok);
    return ok;
  } catch { return false; }
}

export async function GET(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  if (!CID.test(cid)) return new Response("bad cid", { status: 400 });
  const url = new URL(req.url);
  if (!(await isTokenLogo(cid, url.searchParams.get("t"))) && !(await isListed(url.origin, cid))) return new Response("not a listed Pons logo", { status: 404, headers: { "cache-control": "public, s-maxage=300" } });
  for (const g of GATEWAYS) {
    try {
      const r = await fetch(g + cid, { signal: AbortSignal.timeout(8_000) });
      if (!r.ok) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.byteLength > MAX) return new Response("too large", { status: 413, headers: { "cache-control": "public, s-maxage=86400" } });
      const type = sniff(buf);
      if (!type) return new Response("not a raster image", { status: 415, headers: { "cache-control": "public, s-maxage=86400" } });
      return new Response(buf, {
        headers: {
          "content-type": type,
          "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
          "content-security-policy": "default-src 'none'; sandbox",
        },
      });
    } catch { /* next gateway */ }
  }
  return new Response("unavailable", { status: 502, headers: { "cache-control": "public, s-maxage=300" } });
}

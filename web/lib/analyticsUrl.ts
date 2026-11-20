// query values worth counting (which network, which campaign); everything else in the query is dropped
const KEEP = ["chain", "utm_source", "utm_medium", "utm_campaign"];

/** The page address as Vercel Web Analytics receives it: wallet addresses and transaction hashes out of the path
 *  (Wrapped and shared swap pages), the referrer's address out of referral links, and every other query value and the
 *  fragment dropped. The data then shows which pages people open and where they came from, never who they are.
 *  What the privacy section of /docs/terms-privacy promises; change both together. */
export function analyticsUrl(url: string): string {
  const u = new URL(url);
  u.pathname = u.pathname.replace(/^\/wrapped\/[^/]+/, "/wrapped/[address]").replace(/^\/swap\/([^/]+)\/[^/]+/, "/swap/$1/[hash]");
  const q = new URLSearchParams();
  for (const k of KEEP) {
    const v = u.searchParams.get(k);
    if (v) q.set(k, v);
  }
  if (u.searchParams.has("ref")) q.set("ref", "1"); // came through a referral link; whose link stays out
  u.search = q.toString();
  u.hash = "";
  return u.toString();
}

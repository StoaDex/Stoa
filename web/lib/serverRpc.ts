/** Server-side RPC: the Alchemy key in NEXT_PUBLIC_* RPC URLs is shipped to browsers and restricted to stoadex.com,
 *  so it rejects requests without that Origin (every server-side read). On the server, `srv(url)` swaps it for the
 *  key in ROBINHOOD_SERVER_RPC_URL (a separate, unrestricted Alchemy key that never reaches the client: env vars
 *  without NEXT_PUBLIC_ are not bundled). In the browser, or when the variable is unset, the URL is returned as is. */
const SERVER_KEY = (() => {
  if (typeof window !== "undefined") return null;
  const m = /\/v2\/([A-Za-z0-9_-]{8,})/.exec(process.env.ROBINHOOD_SERVER_RPC_URL ?? "");
  return m ? m[1] : null;
})();

export function srv<T extends string | undefined>(url: T): T {
  if (!SERVER_KEY || !url) return url;
  return url.replace(/^(https:\/\/[a-z0-9-]+\.g\.alchemy\.com\/v2\/)[A-Za-z0-9_-]+/, `$1${SERVER_KEY}`) as T;
}

import { createConfig, http, fallback } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { elysium, RPCS } from "./chain";
import { robinhood } from "./networks";
import { SOURCES, SOURCE_RPCS } from "./bridge";

const wc = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
const wcParams = wc ? { projectId: wc, showQrModal: true, metadata: { name: "Stoa", description: "Swap router on Robinhood Chain and Elysium", url: "https://stoadex.com", icons: ["https://stoadex.com/logo.png"] } } : null;
export const WC_ENABLED = !!wc;
/** wagmi keeps the last connector's id under wagmi.recentConnectorId */
function wcWasLast() {
  if (typeof window === "undefined") return false;
  try { return JSON.parse(localStorage.getItem("wagmi.recentConnectorId") ?? "null") === "walletConnect"; } catch { return false; }
}
// JSON-RPC batching per endpoint: dRPC's free plan rejects batches of more than 3 calls
const rpc = (u: string) => http(u, { batch: /drpc\./.test(u) ? { batchSize: 3 } : true });
const rhRpcs = robinhood.rpcUrls.default.http;

export const wagmiConfig = createConfig({
  // the first is the default a WalletConnect session asks for; the rest are only for Bridge in (source chains)
  chains: [robinhood, elysium, ...SOURCES.map((s) => s.chain)],
  multiInjectedProviderDiscovery: true, // MetaMask, Rabby, OKX ... announce themselves (EIP-6963)
  connectors: [
    injected({ shimDisconnect: true }),
    // WalletConnect's provider is about 160 kB of script and sets up storage as soon as its connector exists, so it is
    // created here only when the last session used it (to reconnect it); otherwise when someone picks it
    // (ensureWalletConnect). Browser only: on the server its storage setup fails and logs.
    ...(wcParams && wcWasLast() ? [walletConnect(wcParams)] : []),
  ],
  transports: {
    [elysium.id]: RPCS.length ? fallback(RPCS.map(rpc), { rank: false, retryCount: 1 }) : http(),
    [robinhood.id]: fallback(rhRpcs.map(rpc), { rank: false, retryCount: 1 }),
    ...Object.fromEntries(SOURCES.map((s) => [s.chain.id, fallback((SOURCE_RPCS[s.chain.id] ?? []).map((u) => http(u)).concat(http()), { rank: false, retryCount: 1 })])),
  },
  ssr: true,
});

/** The WalletConnect connector, created and registered the first time it is needed */
export function ensureWalletConnect() {
  if (!wcParams || typeof window === "undefined") return undefined;
  const have = wagmiConfig.connectors.find((c) => c.type === "walletConnect");
  if (have) return have;
  const c = wagmiConfig._internal.connectors.setup(walletConnect(wcParams));
  wagmiConfig._internal.connectors.setState((xs) => [...xs, c]);
  return c;
}

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

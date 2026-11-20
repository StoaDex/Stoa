"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { WagmiProvider, useAccount, useSwitchChain } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { ROBINHOOD, netById, netByKey, type Net } from "@/lib/networks";
import dynamic from "next/dynamic";
// the wallet picker and the price-alert watcher are not needed for the first paint: they load after it
const WalletModal = dynamic(() => import("./WalletModal"), { ssr: false });
const AlertWatcher = dynamic(() => import("./Watch").then((m) => m.AlertWatcher), { ssr: false });

const WalletCtx = createContext<{ open: () => void }>({ open: () => {} });
export const useWalletModal = () => useContext(WalletCtx);

const NetCtx = createContext<{ net: Net; setNet: (n: Net) => void }>({ net: ROBINHOOD, setNet: () => {} });
/** The network the app is showing: Robinhood Chain for a first visit, then the one picked last (or named in ?chain=),
 *  and the wallet's chain whenever the wallet is on a supported one. */
export const useNet = () => useContext(NetCtx).net;
export const useSetNet = () => useContext(NetCtx).setNet;

function NetProvider({ children }: { children: ReactNode }) {
  const [net, setNetState] = useState<Net>(ROBINHOOD);
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  useEffect(() => {
    let k: string | null = new URLSearchParams(location.search).get("chain");
    try { if (!k) k = localStorage.getItem("stoa.net"); } catch { /* storage blocked */ }
    const n = netByKey(k);
    if (n) setNetState(n);
  }, []);
  // follow the wallet when it moves to another supported chain
  useEffect(() => {
    const n = isConnected ? netById(chainId) : undefined;
    if (n && n.key !== net.key) setNetState(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, isConnected]);
  const setNet = useCallback((n: Net) => {
    setNetState(n);
    try { localStorage.setItem("stoa.net", n.key); } catch { /* storage blocked */ }
    if (isConnected && chainId !== n.chain.id) switchChain({ chainId: n.chain.id });
  }, [isConnected, chainId, switchChain]);
  return <NetCtx.Provider value={{ net, setNet }}>{children}</NetCtx.Provider>;
}

export default function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));
  const [open, setOpen] = useState(false);
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <NetProvider>
          <WalletCtx.Provider value={{ open: () => setOpen(true) }}>
            {children}
            {open && <WalletModal open={open} onClose={() => setOpen(false)} />}
            <AlertWatcher />
          </WalletCtx.Provider>
        </NetProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

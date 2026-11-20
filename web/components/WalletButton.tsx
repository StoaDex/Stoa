"use client";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { useNet, useWalletModal } from "./Providers";
import { short } from "./WalletModal";

export default function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { open } = useWalletModal();
  const elysium = useNet().chain;
  // on Bridge in the wallet sits on the source chain (Base, Arbitrum ...) on purpose
  const bridging = usePathname()?.startsWith("/bridge");
  if (!isConnected) return <button className="cta" type="button" onClick={open}>Connect</button>;
  const wrong = chainId !== elysium.id && !bridging;
  return (
    <button className={wrong ? "cta" : "ghost"} type="button" onClick={open} style={wrong ? { background: "#B4532A" } : undefined}>
      <span className="addrchip">{wrong ? "Wrong network" : short(address)}</span>
    </button>
  );
}

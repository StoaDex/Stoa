import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import { CA as STOA_CA } from "@/lib/stoaAddress";

export const metadata: Metadata = {
  title: "Start here",
  description: "New to Stoa? Swap on Robinhood Chain with every venue compared, earn from $STOA in Spotlight and Points, and check everything yourself. Three steps, one screen.",
  alternates: { canonical: "/start" },
};

const STEPS: { n: string; h: string; p: string; links: [string, string, boolean?][] }[] = [
  {
    n: "1", h: "Swap",
    p: "Stoa compares every venue on Robinhood Chain for your exact amount (Uniswap, Aero, Ramses, Pons and more) and fills where you get the most, for a 2 bps fee. Stock tokens, ETH, USDG and new launches.",
    links: [["/trade?chain=robinhood", "Open Trade", true], ["/stocks", "Stock tokens"], ["/bridge", "Bridge ETH in"]],
  },
  {
    n: "2", h: "Earn",
    p: "Points season 1 starts Mon 23 Nov, 00:00 UTC: swaps and referrals earn points. In Spotlight, projects bid ETH and $STOA holders who lock and vote share 90% of the winning bids.",
    links: [["/points", "Points", true], ["/spotlight", "Spotlight"], [`/trade?chain=robinhood&sell=ETH&buy=${STOA_CA}`, "Buy $STOA"], ["/referrals", "Your referral link"]],
  },
  {
    n: "3", h: "Check",
    p: "Run a free safety check on any token before you buy it. Every swap, stock price gap and contract release is open data, and the contracts had an independent security review by HEY Research Lab.",
    links: [["/check", "Token safety check", true], ["/open", "Open data"], ["/security", "Security status"], ["/report", "State of Robinhood Chain"]],
  },
];

export default function StartPage() {
  return (
    <section className="page">
      <PageHead eyebrow="START HERE" title="Stoa in three steps">
        A swap router on Robinhood Chain: every route compared, nothing held between swaps, your wallet signs everything.
      </PageHead>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {STEPS.map((s) => (
          <div key={s.n} className="panel pad" style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
            <span aria-hidden="true" style={{ flex: "none", width: 44, height: 44, borderRadius: 12, background: "var(--ink)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--serif)", fontSize: 24 }}>{s.n}</span>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: "4px 0 6px", fontFamily: "var(--serif)", fontWeight: 400, fontSize: 26 }}>{s.h}</h2>
              <p style={{ margin: 0, lineHeight: 1.55 }}>{s.p}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                {s.links.map(([href, label, main]) => <Link key={href} className={main ? "cta" : "ghost"} href={href}>{label}</Link>)}
              </div>
            </div>
          </div>
        ))}
        <p className="note">
          New to crypto wallets? Install one (MetaMask, Rabby, Coinbase Wallet or any WalletConnect wallet), bridge a little ETH to Robinhood Chain for gas, then swap. <Link href="/docs">Docs</Link> · <a href="https://t.me/StoaDexChat" target="_blank" rel="noopener noreferrer">Ask in the community chat</a>. Not financial advice.
        </p>
      </div>
    </section>
  );
}

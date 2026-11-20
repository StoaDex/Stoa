import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import CopyButton from "@/components/CopyButton";
import { ROBINHOOD, addressUrlOn } from "@/lib/networks";
import dep from "@/lib/deployments-4663.json";

export const metadata: Metadata = {
  title: "Market makers",
  description: "Quote stock tokens and crypto pairs on Robinhood Chain through a Stoa pool. Every Stoa swap compares your quote with every other venue and fills it when it gives the trader more.",
  alternates: { canonical: "/makers" },
};

const REGISTRY = dep.makerRegistry as string;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const STEPS: { t: string; b: string }[] = [
  { t: "Pick a pair", b: "One base/quote pair per pool, for example a stock token against USDG, or WETH against USDG. Open an issue on GitHub with the pair, the sizes you plan to quote and the address that will quote." },
  { t: "Stoa lists the pool", b: "Stoa deploys a StoaPool for the pair with you as its curator and lists it in the MakerRegistry. Listing goes through Stoa's 48-hour timelock, so it is public before it is live." },
  { t: "Post a bond", b: "Bond ETH in the MakerRegistry for that pool, at least the pool's minimum. Withdrawing a bond takes 3 days after you ask, so a bad quote can still be answered for." },
  { t: "Fund it and quote", b: "Send inventory to the pool and post bid and ask prices with sizes. A quote lives for the number of blocks you choose and can be pulled at any time." },
  { t: "Get filled", b: "Every Stoa swap, in the app, the API, the MCP server and the buy card, compares your quote with every other venue on the chain and uses it when it gives the trader more." },
];

const CODE = `// StoaPool on Robinhood Chain: prices are quote-token units per 1 base unit, scaled by 1e18
registry.bond{value: 0.5 ether}(pool);           // once, at least the pool's minimum

pool.setQuote(
  bidPx,       // you buy base at this price
  askPx,       // you sell base at this price (must be above bid)
  bidSize,     // most base you buy at bid
  askSize,     // most base you sell at ask
  20           // valid for 20 blocks, then it expires on its own
);

pool.cancelQuote();                               // pull it at once`;

const FACTS: [string, string][] = [
  ["Fee on fills", "2 bps, to Stoa's FeeDistributor"],
  ["Bond unlock", "3 days after you ask"],
  ["Who lists pools", "Stoa's Safe through a 48-hour timelock"],
  ["Live maker pools today", "None yet. The first pair is open"],
];

export default function MakersPage() {
  return (
    <section className="page">
      <PageHead eyebrow="FOR MARKET MAKERS" title="Quote on Robinhood Chain through Stoa">Post a price once and every Stoa swap compares it with every other venue on the chain. You fill when you give the trader more.</PageHead>
      <div className="grid2 eq" style={{ marginBottom: 20 }}>
        <div className="panel pad">
          <div className="lbl">HOW IT WORKS</div>
          <ol className="list" style={{ marginTop: 8, paddingLeft: 18 }}>
            {STEPS.map((s) => <li key={s.t} style={{ marginBottom: 10 }}><b>{s.t}.</b> {s.b}</li>)}
          </ol>
          <a className="go" href="https://github.com/StoaDex/Stoa/issues/new?title=Maker%20pool%3A%20&labels=maker" target="_blank" rel="noopener noreferrer">Ask for a pool on GitHub</a>
        </div>
        <div className="panel pad">
          <div className="lbl">THE TERMS</div>
          <ul className="list" style={{ marginTop: 8 }}>
            {FACTS.map(([k, v]) => <li key={k}>{k} <b>{v}</b></li>)}
            <li>MakerRegistry <span className="addr"><a href={addressUrlOn(ROBINHOOD, REGISTRY)} target="_blank" rel="noopener noreferrer"><code>{short(REGISTRY)}</code></a><CopyButton text={REGISTRY} /></span></li>
          </ul>
          <p className="note" style={{ marginTop: 12 }}>A quote that is pulled, expired, larger than the pool holds or outside a pool&apos;s optional price check is simply skipped: the swap goes to the next venue. Stoa&apos;s governance can pause a pool and can slash a bond for abuse; both are on-chain and show on <Link href="/open">Open source &amp; data</Link>.</p>
        </div>
      </div>
      <div className="panel pad" style={{ marginBottom: 20 }}>
        <div className="rowx"><div className="lbl">QUOTING · SOLIDITY</div><Link className="note" style={{ marginTop: 0 }} href="/build">Integrate →</Link></div>
        <pre className="code" style={{ marginTop: 12 }}>{CODE}</pre>
        <p className="note" style={{ marginTop: 12 }}>Source: <a href="https://github.com/StoaDex/Stoa/blob/main/contracts/src/StoaPoolL2.sol" target="_blank" rel="noopener noreferrer">StoaPoolL2.sol</a> and <a href="https://github.com/StoaDex/Stoa/blob/main/contracts/src/MakerRegistry.sol" target="_blank" rel="noopener noreferrer">MakerRegistry.sol</a>. Stoa has no formal audit yet; its contracts had an independent security review by Hey Research Lab.</p>
      </div>
      <div className="panel pad">
        <div className="lbl">ALREADY RUNNING A PROPAMM OR RFQ DESK?</div>
        <p style={{ marginTop: 10 }}>Stoa can also read an existing on-chain venue directly, the way it reads Uniswap and Pons today. That needs a small adapter contract, which goes through Stoa&apos;s security review and timelock before it routes any swap. Open an issue with your contract&apos;s quote function and we&apos;ll look at it.</p>
      </div>
    </section>
  );
}

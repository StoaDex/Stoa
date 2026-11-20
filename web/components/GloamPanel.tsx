import Link from "next/link";
import { gloamSwapUrl } from "@/lib/gloam";

/** "Trade privately" on a Robinhood Chain token page: a link to Gloam's Swap tab with the trade filled in. */
export default function GloamPanel({ symbol, address }: { symbol: string; address: string }) {
  const url = gloamSwapUrl(symbol);
  if (!url) return null;
  return (
    <div className="panel pad">
      <div className="rowx"><div className="lbl">TRADE PRIVATELY</div><span className="chip">via Gloam</span></div>
      <p className="note" style={{ marginTop: 8 }}>
        Gloam swaps {symbol} from a private balance: the chain shows the tokens and amounts, not who traded. It is a separate
        app with its own router and pools; Stoa does not route these swaps. Run <Link href={`/check/robinhood/${address}`}>Stoa&apos;s safety check</Link> first.
      </p>
      <a className="ghost" href={url} target="_blank" rel="noopener noreferrer" style={{ marginTop: 10 }}>
        Swap {symbol} privately on Gloam ↗
      </a>
    </div>
  );
}

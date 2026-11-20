"use client";
import { useState } from "react";
import { useAccount } from "wagmi";
import { SITE } from "@/lib/chain";
import { shareOrCopy } from "@/lib/share";

/** Share link and embed code for a token page. Both carry the connected wallet's referral. */
/** `page` is the shared page's path (default the token page; Pons launches pass /launches/<address>) */
export default function TokenShare({ chain, address, symbol, page }: { chain: string; address: string; symbol: string; page?: string }) {
  const { address: me } = useAccount();
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const ref = me ? `?ref=${me}` : "";
  const link = `${SITE}${page ?? `/tokens/${chain}/${address}`}${ref}`;
  const embed = `<iframe src="${SITE}/embed/${chain}/${address}${ref}" width="100%" height="230" style="max-width:420px;border:0;border-radius:16px" title="Buy ${symbol} on Stoa" loading="lazy"></iframe>`;
  const flash = (k: "link" | "embed") => { setCopied(k); setTimeout(() => setCopied(null), 1600); };
  return (
    <div className="panel pad">
      <div className="lbl">SHARE OR EMBED</div>
      <p className="note" style={{ marginTop: 8 }}>
        {me ? "Both carry your referral: you earn 10% of Stoa's fee on every swap made through them." : "Connect a wallet to add your referral: you earn 10% of Stoa's fee on every swap made through your link or widget."}
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" className="ghost" style={{ borderColor: "var(--line)", background: "#fff" }}
          onClick={async () => { if ((await shareOrCopy(link, `Buy ${symbol} on @StoaDEX`)) === "copied") flash("link"); }}>
          {copied === "link" ? "Link copied" : "Share this page"}
        </button>
        <button type="button" className="ghost" style={{ borderColor: "var(--line)", background: "#fff" }}
          onClick={async () => { try { await navigator.clipboard.writeText(embed); flash("embed"); } catch { /* clipboard blocked */ } }}>
          {copied === "embed" ? "Embed code copied" : "Copy embed code"}
        </button>
      </div>
      <p className="note">The embed shows {symbol}&apos;s live quote on Stoa with a Buy button for any website. <a href="/docs/embed">How it works</a></p>
    </div>
  );
}

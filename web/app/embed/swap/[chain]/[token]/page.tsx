import type { Metadata } from "next";
import { SITE } from "@/lib/chain";
import { netByKey } from "@/lib/networks";
import { cleanRef } from "@/lib/swap";
import { payOptions, widgetToken } from "@/lib/embed";
import EmbedSwap from "@/components/EmbedSwap";

// /embed/swap/<chain>/<token>?pay=USDG&amount=25&theme=dark&ref=<wallet>: a swap widget any website can frame. The visitor
// types an amount and sees Stoa's live quote; the button opens Stoa with the same swap filled in. No wallet connects in
// the frame. Builder and docs: /build/widget, /docs/embed.

export const metadata: Metadata = { title: "Swap on Stoa", robots: { index: false, follow: false } };

type P = { params: Promise<{ chain: string; token: string }>; searchParams: Promise<{ ref?: string; pay?: string; amount?: string; theme?: string }> };

function Off({ dark }: { dark: boolean }) {
  return (
    <div className={`embed${dark ? " em-dark" : ""}`}>
      <div className="em-q">This swap widget is not available for this token.<small>The widget works for tokens Stoa lists or routes. Check any token on stoadex.com/check.</small></div>
      <div className="em-foot"><a href={SITE} target="_blank" rel="noopener noreferrer">Powered by <b>STOA</b></a><span>not financial advice</span></div>
    </div>
  );
}

export default async function SwapWidget({ params, searchParams }: P) {
  const [{ chain, token }, sp] = await Promise.all([params, searchParams]);
  const dark = sp.theme === "dark";
  const net = netByKey(chain);
  const buy = net ? await widgetToken(chain, token) : null;
  if (!net || !buy) return <Off dark={dark} />;
  const pays = payOptions(net);
  const want = (sp.pay ?? "").toLowerCase();
  const payIndex = Math.max(0, pays.findIndex((t) => t.symbol.toLowerCase() === want || (t.address !== "native" && t.address.toLowerCase() === want)));
  const amount = /^\d{1,12}(\.\d{1,8})?$/.test(sp.amount ?? "") ? sp.amount! : pays[payIndex].address === "native" ? "0.01" : "25";
  return <EmbedSwap chain={net.key} chainName={net.name} buy={buy} pays={pays} payIndex={payIndex} amount={amount} refAddr={cleanRef(sp.ref) ?? null} site={SITE} dark={dark} />;
}

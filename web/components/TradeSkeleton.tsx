/** Trade as the server can draw it: the swap form for ETH → USDG on Robinhood Chain, before the wallet code loads.
 *  Same classes and sizes as the live form, so nothing moves when it takes over. Nothing in it is interactive. */
export default function TradeSkeleton() {
  return (
    <div className="grid2" aria-busy="true">
      <div className="panel pad" style={{ position: "relative" }}>
        <div className="rowx" style={{ marginBottom: 12 }}>
          <div className="seg" role="tablist">
            <button className="on" type="button" role="tab" aria-selected disabled>Swap</button>
            <button type="button" role="tab" aria-selected={false} disabled>Limit</button>
          </div>
          <span className="ghost" style={{ borderColor: "var(--line)", background: "#fff" }}>0.5%</span>
        </div>
        <div className="box">
          <div className="row"><span className="blab">You sell</span><span /></div>
          <div className="row"><span className="out" style={{ fontSize: 30, color: "#848E9D" }}>0.00</span><span className="tok"><Icon src="/tokens/eth.svg" />ETH</span></div>
        </div>
        <div className="flip"><button type="button" aria-label="Switch tokens" disabled><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" /></svg></button></div>
        <div className="box">
          <div className="row"><span className="blab">You get</span><span /></div>
          <div className="row"><span className="out" style={{ fontSize: 30, color: "#848E9D" }}>0.00</span><span className="tok"><Icon src="/tokens/0x5fc5360d0400a0fd4f2af552add042d716f1d168.webp" />USDG</span></div>
        </div>
        <button type="button" className="big" disabled>Enter an amount</button>
      </div>
      <div />
    </div>
  );
}

function Icon({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="ti" style={{ position: "relative", overflow: "hidden" }}><img className="ti img" src={src} alt="" width={26} height={26} style={{ position: "absolute", inset: 0 }} /></span>;
}

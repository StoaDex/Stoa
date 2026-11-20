import Link from "next/link";
import StoaCA from "./StoaCA";
import AppInstall from "./AppInstall";
import StatusPill from "./StatusPill";

export default function Footer() {
  return (
    <footer className="foot">
      <div>
        <Link className="brand" href="/"><img src="/logo.png" alt="" /><span>STOA</span></Link>
        <p className="note" style={{ maxWidth: 260 }}>A swap router on Robinhood Chain and Elysium. Every venue it uses, compared on every swap.</p>
        <StoaCA />
      </div>
      <div className="cols">
        <div><p className="fh">TRADE</p><Link prefetch={false} href="/trade">Trade</Link><Link prefetch={false} href="/bridge">Bridge in</Link><Link prefetch={false} href="/stocks">Stocks</Link><Link prefetch={false} href="/tokens">Tokens</Link><Link prefetch={false} href="/launches">Launches</Link><Link prefetch={false} href="/pools">Pools</Link><Link prefetch={false} href="/cover">Rug Cover</Link></div>
        <div><p className="fh">$STOA &amp; YOU</p><Link prefetch={false} href="/token">$STOA</Link><Link prefetch={false} href="/spotlight">Spotlight</Link><Link prefetch={false} href="/projects">For token projects</Link><Link prefetch={false} href="/earn">Earn</Link><Link prefetch={false} href="/points">Points</Link><Link prefetch={false} href="/portfolio">Portfolio</Link><Link prefetch={false} href="/wrapped">Wrapped</Link><Link prefetch={false} href="/referrals">Referrals</Link></div>
        <div><p className="fh">LEARN</p><Link prefetch={false} href="/start">Start here</Link><Link prefetch={false} href="/docs">Docs</Link><Link prefetch={false} href="/guides">Community guides</Link><Link prefetch={false} href="/stats">Stats</Link><Link prefetch={false} href="/weekly">This week</Link><Link prefetch={false} href="/report">State of Robinhood Chain</Link><Link prefetch={false} href="/changelog">Changelog</Link><Link prefetch={false} href="/">Walk the Stoa</Link><Link prefetch={false} href="/build">Integrate</Link><Link prefetch={false} href="/makers">Market makers</Link><Link prefetch={false} href="/curators">Curators</Link></div>
        <div><p className="fh">TRUST &amp; COMMUNITY</p><Link prefetch={false} href="/security">Security status</Link><Link prefetch={false} href="/status">System status</Link><Link prefetch={false} href="/open">Open source &amp; data</Link><Link prefetch={false} href="/check">Token safety check</Link><Link prefetch={false} href="/docs/admin">Admin &amp; security</Link><Link prefetch={false} href="/docs/bug-bounty">Security reports</Link><Link prefetch={false} href="/docs/terms-privacy">Terms &amp; privacy</Link><Link prefetch={false} href="/press">Press kit</Link><a href="https://x.com/StoaDEX" target="_blank" rel="noopener noreferrer">X · @StoaDEX</a><a href="https://t.me/StoaDex" target="_blank" rel="noopener noreferrer">Telegram · announcements</a><a href="https://t.me/StoaDexChat" target="_blank" rel="noopener noreferrer">Telegram · community chat</a><a href="https://github.com/StoaDex/Stoa" target="_blank" rel="noopener noreferrer">GitHub · source code</a><a href="https://explorer.twigpine.com/repos/z6Mkogs4MbcB3pBnpQygxpgWtt6LTJSCbmpiBhRBHgHvnMRt/stoa" target="_blank" rel="noopener noreferrer">Twigpine · signed mirror</a><a href="https://huggingface.co/datasets/StoaDex/stoa-onchain" target="_blank" rel="noopener noreferrer">Hugging Face · open data</a><a href="https://www.coingecko.com/en/coins/stoa" target="_blank" rel="noopener noreferrer">CoinGecko · $STOA</a><AppInstall /></div>
      </div>
      <div className="badge">
        {/* HEY Research Lab badge (HEY looks for it on our site; one-line pill variant of their snippet) */}
        <a href="https://heyresearch.xyz/project/stoa?utm_source=badge&utm_medium=html" target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://heyresearch.xyz/api/badge/stoa?style=pill" alt="Stoa on HEY Research Lab" width={439} height={36} decoding="async" />
        </a>
        {/* where the code and data live, as pills next to HEY's badge */}
        <a className="obadge" href="https://huggingface.co/StoaDex" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">🤗</span> Hugging Face <small>open data</small></a>
        <a className="obadge" href="https://github.com/StoaDex/Stoa" target="_blank" rel="noopener noreferrer"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.4-.5-1.6.2-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.6.2 2.8.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z" /></svg> GitHub <small>source</small></a>
        <a className="obadge" href="https://explorer.twigpine.com/repos/z6Mkogs4MbcB3pBnpQygxpgWtt6LTJSCbmpiBhRBHgHvnMRt/stoa" target="_blank" rel="noopener noreferrer"><svg width="14" height="14" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 29.5V9M10 15.5l6-5.5 6 5.5M8 21.5l8-6.5 8 6.5M6.5 27.5l9.5-7 9.5 7" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="16" cy="5.2" r="3" fill="#0b7a48" stroke="currentColor" strokeWidth="1.7" /></svg> Twigpine <small>signed mirror</small></a>
        <a className="obadge" href="/open"><span aria-hidden="true">✓</span> Open source &amp; data</a>
        <StatusPill />
      </div>
    </footer>
  );
}

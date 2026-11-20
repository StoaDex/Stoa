"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import WalletButton from "./WalletButton";
import NetSwitch from "./NetSwitch";
import { NAV_GROUPS } from "@/lib/siteNav";

// the top bar: the same five places as the phone tab bar; everything else (Stocks, Launches, Spotlight, Earn, Referrals,
// Docs) is one tap away in the menu, which opens on every screen size
const TABS = [["/trade", "Trade"], ["/tokens", "Tokens"], ["/bridge", "Bridge"], ["/token", "$STOA"], ["/portfolio", "Portfolio"]] as const;
// the menu: every page in the same four groups as the More page and the footer, two columns, so it fits one phone screen
const MENU = NAV_GROUPS;

export default function Header({ extra }: { extra?: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const menuRef = useRef<HTMLElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // the open menu covers the page, so it closes as soon as the page scrolls, on a tap outside it and on Escape
  useEffect(() => {
    if (!open) return;
    const start = scrollY;
    const close = () => setOpen(false);
    const onScroll = () => { if (Math.abs(scrollY - start) > 12) close(); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("pointerdown", onDown);
    addEventListener("keydown", onKey);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("pointerdown", onDown); removeEventListener("keydown", onKey); };
  }, [open]);
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const f = () => setSolid(scrollY > 8);
    f(); addEventListener("scroll", f, { passive: true });
    return () => removeEventListener("scroll", f);
  }, [path]);
  // a section is active on its own path and below it (/launches/<token>), not on look-alikes (/tokens is not /token)
  const on = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(`${h}/`));
  return (
    <>
      <header className={`hdr${solid && path !== "/" ? " solid" : ""}`}>
        <Link className="brand" href="/" prefetch={false}><img src="/logo.png" alt="" /><span>STOA</span></Link>
        <nav className="tabs" aria-label="Main">
          {TABS.map(([h, l]) => <Link key={h} href={h} className={on(h) ? "on" : undefined}>{l}</Link>)}
        </nav>
        <div className="right">
          <a className="ghost hide-m" href="https://x.com/StoaDEX" target="_blank" rel="noopener noreferrer" aria-label="Stoa on X">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-6.9-6.1 6.9H1.3l7.9-9L.9 2.3h7l4.8 6.3 5.5-6.3zm-1.2 17.9h1.9L7.1 4.2H5.1l11.9 16z" /></svg>
          </a>
          {extra}
          <NetSwitch />
          <WalletButton />
          <button ref={btnRef} className="ghost menu-btn" type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
        </div>
      </header>
      <nav ref={menuRef} className={`menu${open ? " open" : ""}`} aria-label="Menu" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>
        {MENU.map((g) => (
          <div key={g.h} className="mgroup">
            <div className="mh">{g.h}</div>
            <div className="mgrid">{g.items.map(([h, l]) => <Link key={h} href={h} className={on(h) ? "on" : undefined}>{l}</Link>)}</div>
          </div>
        ))}
        <a className="mx" href="https://x.com/StoaDEX" target="_blank" rel="noopener noreferrer">X · @StoaDEX</a>
        <a className="mx" href="https://t.me/StoaDex" target="_blank" rel="noopener noreferrer">Telegram · announcements</a>
        <a className="mx" href="https://t.me/StoaDexChat" target="_blank" rel="noopener noreferrer">Telegram · community chat</a>
      </nav>
    </>
  );
}

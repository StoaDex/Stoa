"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLatePrefetch } from "@/lib/latePrefetch";

// the phone tab bar: the four places people go most, and More for the rest (it replaces the header menu and the
// footer's link columns below 860px)
const ITEMS = [
  { h: "/trade", l: "Trade", d: "M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3", also: ["/stocks", "/launches", "/pools", "/cover", "/check"] },
  { h: "/tokens", l: "Tokens", d: "", also: [] },
  { h: "/bridge", l: "Bridge", d: "M3 17h18M5 17V9a7 7 0 0 1 14 0v8M9 17v-5M15 17v-5", also: [] },
  { h: "/token", l: "$STOA", d: "M4 6h16M4 20h16M7 6v14M12 6v14M17 6v14", also: ["/spotlight", "/earn"] },
  { h: "/more", l: "More", d: "", also: [] },
] as const;

export default function MobileNav() {
  const path = usePathname();
  useLatePrefetch(ITEMS.map((i) => i.h));
  const under = (h: string) => path === h || path.startsWith(`${h}/`);
  const active = ITEMS.find((i) => under(i.h) || i.also.some(under))?.h;
  return (
    <nav className="mnav" aria-label="Main">
      {ITEMS.map((i) => (
        <Link key={i.h} href={i.h} prefetch={false} className={active === i.h ? "on" : undefined} aria-current={active === i.h ? "page" : undefined}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {i.h === "/tokens" ? <><circle cx="9" cy="9" r="5" /><circle cx="15" cy="15" r="5" /></>
              : i.h === "/more" ? <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>
              : <path d={i.d} />}
          </svg>
          <span>{i.l}{i.h === "/more" && <span className="sr-only"> pages and tools</span>}</span>
        </Link>
      ))}
    </nav>
  );
}

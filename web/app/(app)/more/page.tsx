import type { Metadata } from "next";
import Link from "next/link";
import StoaCA from "@/components/StoaCA";
import AppInstall from "@/components/AppInstall";
import { NAV_GROUPS, SOCIALS } from "@/lib/siteNav";

export const metadata: Metadata = {
  title: "More",
  description: "Every page on Stoa: trading, $STOA, docs and security.",
  alternates: { canonical: "/more" },
};

export default function MorePage() {
  return (
    <section className="page more">
      <h1 className="more-h">More</h1>
      {NAV_GROUPS.map((g) => (
        <section key={g.h} className="more-g">
          <h2 className="lbl">{g.h.toUpperCase()}</h2>
          <div className="more-grid">
            {g.items.map(([h, l]) => <Link key={h} href={h}>{l}</Link>)}
          </div>
        </section>
      ))}
      <section className="more-g">
        <h2 className="lbl">COMMUNITY</h2>
        <div className="more-grid">
          {SOCIALS.map(([h, l]) => <a key={h} href={h} target="_blank" rel="noopener noreferrer">{l}</a>)}
        </div>
      </section>
      <div className="panel pad more-ca"><StoaCA short /><AppInstall /></div>
    </section>
  );
}

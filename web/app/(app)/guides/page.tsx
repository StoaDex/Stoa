import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import { GUIDES } from "@/lib/guides";

const description = "Community guides to Stoa on Robinhood Chain: first swaps, the free token safety check, stock tokens and full walkthroughs, written by users in the #StoaGuide contest.";
export const metadata: Metadata = {
  title: "Community guides",
  description,
  alternates: { canonical: "/guides" },
  openGraph: { title: "Community guides · Stoa", description, type: "website", siteName: "Stoa", url: "/guides" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "Community guides · Stoa", description },
};

const xUrl = (handle: string) => `https://x.com/search?q=${encodeURIComponent(`from:${handle} #StoaGuide`)}&f=live`;

export default function GuidesPage() {
  return (
    <section className="page" style={{ maxWidth: 860 }}>
      <PageHead eyebrow="LEARN · BY THE COMMUNITY" title="Community guides">
        Threads and videos by people who use Stoa, picked from the #StoaGuide contest for clarity, accuracy and usefulness to someone new.
      </PageHead>
      {GUIDES.map((g) => (
        <div key={g.id} id={g.id} className="panel pad" style={{ marginBottom: 16 }}>
          <div className="lbl">{g.h.toUpperCase()}</div>
          <p className="note" style={{ marginTop: 6 }}>{g.intro}</p>
          <ul className="list" style={{ marginTop: 6 }}>
            {g.guides.map((x) => (
              <li key={x.handle} style={{ display: "block" }}>
                <a href={x.url ?? xUrl(x.handle)} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>{x.title} ↗</a>
                <span style={{ display: "block", fontFamily: "var(--num)", fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>@{x.handle}{x.badge ? ` · ${x.badge} place` : ""}</span>
                <span style={{ display: "block", color: "var(--muted)", fontSize: 14, marginTop: 4 }}>{x.why}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="note">These are written by users, not by Stoa, and can go out of date as Stoa ships. When something differs, the <Link href="/docs">docs</Link> are the reference. Nothing here is financial advice.</p>
    </section>
  );
}

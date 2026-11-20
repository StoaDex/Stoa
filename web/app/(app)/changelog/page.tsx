import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import { CHANGES, fmtDate } from "@/lib/changelog";

const description = "What Stoa shipped, with dates: Robinhood Chain and Elysium releases, contracts and $STOA.";
export const metadata: Metadata = {
  title: "Changelog",
  description,
  openGraph: { title: "Changelog · Stoa", description, type: "website", siteName: "Stoa" },
  twitter: { card: "summary_large_image", site: "@StoaDex", title: "Changelog · Stoa", description },
  alternates: { canonical: "/changelog", types: { "application/rss+xml": "/changelog/rss.xml" } },
};

export default function ChangelogPage() {
  return (
    <section className="page">
      <PageHead eyebrow="CHANGELOG" title="What we shipped" action={<a className="cta" href="/changelog/rss.xml">RSS feed</a>}>
        Every release, newest first. Anything still waiting on the 48h timelock is marked as scheduled.
      </PageHead>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* the newest three open; older releases fold to their title (a link to one opens it) */}
        {CHANGES.map((c, i) => (
          <details key={c.id} id={c.id} className="panel pad clog" open={i < 3}>
            <summary>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <time className="eyebrow" dateTime={c.date}>{fmtDate(c.date).toUpperCase()}</time>
              <span className="chip">{c.tag}</span>
            </div>
            <h2 style={{ margin: "10px 0 4px", fontSize: 20, fontWeight: 500, color: "var(--ink)" }}>{c.title}</h2>
            </summary>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6, fontSize: 14.5, lineHeight: 1.5 }}>
              {c.items.map((it) => <li key={it}>{it}</li>)}
            </ul>
            {c.link && <p className="note"><Link href={c.link.href}>{c.link.label} →</Link></p>}
          </details>
        ))}
      </div>
    </section>
  );
}

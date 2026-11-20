import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import { runChecks, type Level } from "@/lib/statusChecks";
import UptimeHistory from "@/components/UptimeHistory";

export const metadata: Metadata = {
  title: "Status",
  description: "Is Stoa working right now? Swaps on Robinhood Chain and Elysium, limit orders, Rug Cover, Spotlight, keepers and price data, checked live every minute.",
  alternates: { canonical: "/status" },
};
export const revalidate = 60;

const COLOR: Record<Level, string> = { ok: "#15803d", warn: "#a16207", down: "#b91c1c" };
const WORD: Record<Level, string> = { ok: "Working", warn: "Degraded", down: "Down" };

export default async function StatusPage() {
  const { checks, at } = await runChecks();
  const worst: Level = checks.some((c) => c.level === "down") ? "down" : checks.some((c) => c.level === "warn") ? "warn" : "ok";
  const groups = [...new Set(checks.map((c) => c.group))];
  const headline = worst === "ok" ? "Everything is working" : worst === "warn" ? "Working, with something degraded" : "Something is down";
  return (
    <section className="page">
      <PageHead eyebrow="STATUS" title="Is Stoa working?">
        The parts Stoa depends on, checked live from the chains and data sources. The page refreshes every minute.
      </PageHead>
      <div className="panel pad" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, borderLeft: `4px solid ${COLOR[worst]}` }}>
        <span aria-hidden style={{ width: 14, height: 14, borderRadius: 999, background: COLOR[worst], flex: "none", boxShadow: `0 0 0 4px ${COLOR[worst]}22` }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{headline}</div>
          <div className="note" style={{ margin: 0 }}>Checked {new Date(at).toUTCString().slice(17, 22)} UTC, {new Date(at).toUTCString().slice(5, 16)}</div>
        </div>
      </div>
      <UptimeHistory />
      {groups.map((g) => (
        <div key={g} className="panel pad" style={{ marginBottom: 16 }}>
          <div className="lbl">{g.toUpperCase()}</div>
          <ul className="list">
            {checks.filter((c) => c.group === g).map((c) => (
              <li key={c.name} style={{ alignItems: "flex-start" }}>
                <span style={{ display: "flex", gap: 10, minWidth: 0 }}>
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: COLOR[c.level], flex: "none", marginTop: 5 }} />
                  <span style={{ minWidth: 0 }}>
                    {c.name}
                    <small style={{ display: "block", color: "var(--muted)" }}>{c.detail}{c.ms !== undefined && c.level === "ok" ? ` · ${c.ms} ms` : ""}</small>
                  </span>
                </span>
                <b style={{ color: COLOR[c.level], whiteSpace: "nowrap" }}>{WORD[c.level]}</b>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="panel pad">
        <div className="lbl">ABOUT THESE CHECKS</div>
        <p style={{ marginTop: 8 }}>
          Each swap check reads the router&apos;s pause switch and asks it for a quote (0.01 ETH to USDG on Robinhood Chain, 1 HYPE to USDC on Elysium), with nothing sent. An outside monitor also checks the site, Trade, a live quote and the APIs every 15 minutes; its record is the uptime above.
        </p>
        <p className="note" style={{ marginBottom: 0 }}>
          Who controls each contract, the timelock and the reviews: <Link href="/security">Security status</Link>. Problems: <a href="https://t.me/StoaDexChat" target="_blank" rel="noopener noreferrer">Telegram</a> or <a href="https://x.com/StoaDEX" target="_blank" rel="noopener noreferrer">@StoaDEX</a>.
        </p>
      </div>
    </section>
  );
}

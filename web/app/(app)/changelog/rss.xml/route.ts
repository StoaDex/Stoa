import { SITE } from "@/lib/chain";
import { CHANGES, changeDate } from "@/lib/changelog";

export const dynamic = "force-static";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function GET() {
  const base = SITE.replace(/\/$/, "");
  const items = CHANGES.map((c) => {
    const url = `${base}/changelog#${c.id}`;
    const body = `<ul>${c.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
    return `<item><title>${esc(c.title)}</title><link>${url}</link><guid isPermaLink="false">stoa-${c.id}</guid><pubDate>${changeDate(c.date).toUTCString()}</pubDate><category>${esc(c.tag)}</category><description><![CDATA[${body}]]></description></item>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Stoa changelog</title><link>${base}/changelog</link><atom:link href="${base}/changelog/rss.xml" rel="self" type="application/rss+xml"/><description>What Stoa shipped on Robinhood Chain and Elysium.</description><language>en</language><lastBuildDate>${changeDate(CHANGES[0].date).toUTCString()}</lastBuildDate>${items}</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}

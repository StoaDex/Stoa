import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { docPage, docsIndex, flatDocs } from "@/lib/docs";
import DocsNav from "@/components/DocsNav";
import { SITE } from "@/lib/chain";

const plain = (h: string) =>
  h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
/** Search snippet: the lead, topped up from the page when it is short, cut at a word near 155 characters. */
function describe(lead: string, html: string): string {
  let t = plain(lead);
  // top up from the page's first paragraphs only: tables, lists and headings read badly as a snippet
  for (const m of html.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
    if (t.length >= 110) break;
    t = `${t} ${plain(m[1])}`.trim();
  }
  if (t.length <= 158) return t;
  const cut = t.slice(0, 155);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 120)).replace(/[,;:.\s]+$/, "")}…`;
}

/** FAQPage structured data from the FAQ page: each h3 is a question, the text up to the next heading its answer. */
function faqLd(html: string) {
  const items = [...html.matchAll(/<h3 id="[^"]*">([\s\S]*?)<\/h3>([\s\S]*?)(?=<h[23] |$)/g)];
  return {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: items.map(([, q, a]) => ({ "@type": "Question", name: plain(q), acceptedAnswer: { "@type": "Answer", text: plain(a).replace(/\s+([.,;:)])/g, "$1") } })),
  };
}

export const dynamicParams = false;
export function generateStaticParams() {
  return flatDocs().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = docPage(slug);
  return d ? { title: `${d.title} · Docs`, description: describe(d.lead, d.html), alternates: { canonical: `/docs/${slug}` } } : {};
}

export default async function DocPageView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = docPage(slug);
  if (!d) notFound();
  const flat = flatDocs();
  const i = flat.findIndex((x) => x.slug === slug);
  const prev = flat[i - 1], next = flat[i + 1];
  // search corpus (titles + plain text), small enough to ship to the client
  const corpus = flat.map((x) => {
    const p = docPage(x.slug)!;
    return { slug: x.slug, title: x.title, group: x.group, text: (p.lead + " " + p.html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2000) };
  });
  return (
    <section className="page docs-page">
      <div className="dl">
        <DocsNav index={docsIndex()} current={slug} title={d.title} corpus={corpus} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
            { "@type": "ListItem", position: 1, name: "Docs", item: `${SITE}/docs/introduction` },
            { "@type": "ListItem", position: 2, name: d.title, item: `${SITE}/docs/${slug}` },
          ],
        }) }} />
        {slug === "faq" && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd(d.html)) }} />}
        <article className="dmain">
          <div className="crumb">{d.group}</div>
          <h1>{d.title}</h1>
          <p className="lead" dangerouslySetInnerHTML={{ __html: d.lead }} />
          <div dangerouslySetInnerHTML={{ __html: d.html }} />
          <div className="panel pad" style={{ margin: "28px 0 8px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontWeight: 600, marginRight: "auto" }}>Try it on Stoa</span>
            <Link className="cta" href="/trade?chain=robinhood" prefetch={false}>Swap</Link>
            <Link className="ghost" href="/stocks" prefetch={false}>Stock tokens</Link>
            <Link className="ghost" href="/check" prefetch={false}>Check a token</Link>
          </div>
          <div className="pn">
            {prev && <Link href={`/docs/${prev.slug}`}><small>Previous</small>{prev.title}</Link>}
            {next && <Link className="nx" href={`/docs/${next.slug}`}><small>Next</small>{next.title}</Link>}
          </div>
        </article>
        <aside className="dtoc">
          {d.toc.length > 0 && <><h5>ON THIS PAGE</h5>{d.toc.map((t) => <a key={t.id} href={`#${t.id}`}>{t.text}</a>)}</>}
        </aside>
      </div>
    </section>
  );
}

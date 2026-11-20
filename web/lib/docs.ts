import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Marked } from "marked";

/** Docs live in content/docs as GitBook-compatible markdown (SUMMARY.md + one file per page),
 *  so the same folder can be synced to stoadex.com/docs with GitBook Git Sync. */
const DIR = path.join(process.cwd(), "content", "docs");

export interface DocLink { slug: string; title: string; group: string }
export interface DocPage extends DocLink { lead: string; html: string; toc: { id: string; text: string }[] }

export function docsIndex(): { group: string; pages: DocLink[] }[] {
  const lines = readFileSync(path.join(DIR, "SUMMARY.md"), "utf8").split("\n");
  const out: { group: string; pages: DocLink[] }[] = [];
  for (const l of lines) {
    const g = l.match(/^##\s+(.+)/);
    if (g) { out.push({ group: g[1].trim(), pages: [] }); continue; }
    const p = l.match(/^\*\s+\[(.+?)\]\((.+?)\.md\)/);
    if (p && out.length) out[out.length - 1].pages.push({ slug: p[2], title: p[1], group: out[out.length - 1].group });
  }
  return out;
}

export function flatDocs(): DocLink[] {
  return docsIndex().flatMap((g) => g.pages);
}

const slugify = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function docPage(slug: string): DocPage | undefined {
  const link = flatDocs().find((d) => d.slug === slug);
  if (!link) return undefined;
  let src = readFileSync(path.join(DIR, `${slug}.md`), "utf8");

  // title and lead
  src = src.replace(/^#\s+.+\n+/, "");
  const leadEnd = src.indexOf("\n\n");
  const lead = (leadEnd > 0 ? src.slice(0, leadEnd) : src).trim();
  src = leadEnd > 0 ? src.slice(leadEnd + 2) : "";

  // GitBook hints -> callouts
  src = src.replace(/\{% hint style="(\w+)" %\}([\s\S]*?)\{% endhint %\}/g, (_m, style: string, body: string) =>
    `<div class="hint-box${style === "warning" || style === "danger" ? " warn" : ""}"><span>${style === "info" ? "ℹ" : "⚠"}</span><div>${new Marked().parseInline(body.trim())}</div></div>`);

  const toc: { id: string; text: string }[] = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const id = slugify(text);
        if (depth === 2) toc.push({ id, text: text.replace(/<[^>]+>/g, "") });
        return `<h${depth} id="${id}">${text}</h${depth}>`;
      },
      link({ href, tokens }) {
        const text = this.parser.parseInline(tokens);
        let h = href;
        if (/^[a-z0-9-]+\.md$/.test(h)) h = `/docs/${h.replace(/\.md$/, "")}`;
        h = h.replace(/^https:\/\/stoa\.trade\//, "/");
        const ext = /^https?:/.test(h);
        return `<a href="${h}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
      },
      code({ text, lang }) {
        const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<pre class="code" data-lang="${lang ?? ""}"><code>${esc}</code></pre>`;
      },
    },
  });
  const html = marked.parse(src, { async: false }) as string;
  return { ...link, lead: new Marked().parseInline(lead) as string, html, toc };
}

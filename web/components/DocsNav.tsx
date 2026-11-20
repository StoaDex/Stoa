"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

type L = { slug: string; title: string; group: string };
export default function DocsNav({ index, current, title, corpus }: { index: { group: string; pages: L[] }[]; current: string; title: string; corpus: (L & { text: string })[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? corpus.filter((c) => (c.title + " " + c.text).toLowerCase().includes(s)).slice(0, 8) : [];
  }, [q, corpus]);
  return (
    <>
      <button className="dmenu" type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}><span>{title}</span><span aria-hidden="true">☰</span></button>
      <aside className={`dside${open ? " open" : ""}`} aria-label="Docs navigation">
        <label className="dsearch">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input type="search" placeholder="Search docs" aria-label="Search docs" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {q ? (
          <div className="sres">{hits.length ? hits.map((h) => <Link key={h.slug} href={`/docs/${h.slug}`} onClick={() => setQ("")}>{h.title}<small>{h.group}</small></Link>) : <p className="note">No results.</p>}</div>
        ) : (
          <nav>
            {index.map((g) => (
              <div className="dgrp" key={g.group}><h5>{g.group.toUpperCase()}</h5>
                {g.pages.map((p) => <Link key={p.slug} href={`/docs/${p.slug}`} className={p.slug === current ? "on" : undefined} onClick={() => setOpen(false)}>{p.title}</Link>)}
              </div>
            ))}
          </nav>
        )}
      </aside>
    </>
  );
}

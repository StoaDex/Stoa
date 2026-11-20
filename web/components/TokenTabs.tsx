"use client";
import { useState, type ReactNode } from "react";

/** The token page's detail tabs. Every panel stays in the page (search engines and screen readers read them all);
 *  only the chosen one is shown. */
export default function TokenTabs({ tabs, label }: { tabs: { key: string; label: string; body: ReactNode }[]; label: string }) {
  const [on, setOn] = useState(tabs[0]?.key);
  return (
    <div className="ttabs">
      <div className="ttab-list" role="tablist" aria-label={label} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" id={`tt-${t.key}`} aria-selected={on === t.key} aria-controls={`tp-${t.key}`}
            className={on === t.key ? "on" : undefined} onClick={() => setOn(t.key)}>{t.label}</button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={`tp-${t.key}`} aria-labelledby={`tt-${t.key}`} hidden={on !== t.key} className="ttab-panel">{t.body}</div>
      ))}
    </div>
  );
}

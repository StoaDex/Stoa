import { readMirrorSync, TWIGPINE_REPO_URL } from "@/lib/mirrorSync";

function ago(iso?: string): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

export default async function MirrorSync() {
  const m = await readMirrorSync();
  const state = !m.ok ? "Check unavailable right now" : m.inSync ? "In sync" : "Catching up";
  const color = !m.ok ? "var(--muted)" : m.inSync ? "#15803d" : "#b45309";
  return (
    <div className="panel pad">
      <div className="rowx">
        <div className="lbl">CODE MIRROR · LIVE CHECK</div>
        <span style={{ color, fontWeight: 700 }}>{m.ok && m.inSync ? "✓ " : ""}{state}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", marginTop: 10, fontSize: 14 }}>
        <span>GitHub main</span>
        <a href={m.github ? `https://github.com/StoaDex/Stoa/commit/${m.github}` : "https://github.com/StoaDex/Stoa"} target="_blank" rel="noopener noreferrer"><code>{m.github ? m.github.slice(0, 7) : "unknown"}</code></a>
        <span>Twigpine main</span>
        <a href={TWIGPINE_REPO_URL} target="_blank" rel="noopener noreferrer"><code>{m.twigpine ? m.twigpine.slice(0, 7) : "unknown"}</code>{m.twigpineAt ? ` · signed push ${ago(m.twigpineAt)}` : ""}</a>
      </div>
      <p className="note" style={{ marginBottom: 0 }}>
        {m.ok && !m.inSync ? "A new change is on GitHub; the signed copy usually follows within a few minutes. " : ""}
        Both should show the same commit. Checked every 2 minutes.
      </p>
    </div>
  );
}

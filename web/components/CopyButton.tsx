"use client";
import { useState } from "react";
export default function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [s, setS] = useState(label);
  return (
    <button className="cp" type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setS("Copied"); } catch { setS("Copy failed"); }
      setTimeout(() => setS(label), 1500);
    }}>{s}</button>
  );
}

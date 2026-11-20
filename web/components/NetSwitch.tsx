"use client";
import { useEffect, useRef, useState } from "react";
import { NETS } from "@/lib/networks";
import { useNet, useSetNet } from "./Providers";

/** Network picker in the header. Picking one switches the wallet too when it is connected. */
export default function NetSwitch() {
  const net = useNet(), setNet = useSetNet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("mousedown", down); addEventListener("keydown", key);
    return () => { removeEventListener("mousedown", down); removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div className="netsw" ref={ref}>
      <button className="ghost" type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`Network: ${net.name}`} onClick={() => setOpen((o) => !o)}>
        <img className="netlogo" src={net.logo} alt="" width={20} height={20} /><span className="hide-s">{net.short}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="panel netm" role="listbox" aria-label="Choose a network">
          {NETS.map((n) => (
            <button key={n.key} type="button" role="option" aria-selected={n.key === net.key} className={n.key === net.key ? "on" : undefined} onClick={() => { setNet(n); setOpen(false); }}>
              <img className="netlogo" src={n.logo} alt="" width={28} height={28} /><span><b>{n.name}</b><small>{n.gas} · {n.deployed ? "live" : "opening soon"}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

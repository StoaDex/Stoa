"use client";
import { useEffect, useState } from "react";

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Registers the service worker (production only) and offers "Install app": the browser's own prompt where there is
 *  one (Chrome, Edge, Android), and the Add to Home Screen steps on iPhone and iPad. Hidden once installed. */
export default function AppInstall({ variant = "link" }: { variant?: "link" | "banner" }) {
  const [evt, setEvt] = useState<Prompt | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [help, setHelp] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (variant === "link" && "serviceWorker" in navigator && location.protocol === "https:" && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* the site works without it */ });
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent));
    try { setHidden(localStorage.getItem("stoa-install-dismissed") === "1"); } catch { /* storage off */ }
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as Prompt); };
    const onInstalled = () => { setInstalled(true); setEvt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, [variant]);

  if (installed || (!evt && !ios)) return null;
  const install = async () => {
    if (evt) { await evt.prompt(); const c = await evt.userChoice; if (c.outcome === "accepted") setInstalled(true); setEvt(null); }
    else setHelp(true);
  };
  const steps = help && <span className="note" style={{ display: "block", marginTop: 6 }}>In Safari, tap Share, then Add to Home Screen.</span>;

  if (variant === "banner") {
    if (hidden) return null;
    return (
      <div className="installbar">
        <img src="/icons/icon-192.png" alt="" />
        <div><b>Stoa as an app</b><span>Opens straight to Trade from your home screen.</span>{steps}</div>
        <button className="cta" type="button" onClick={install}>Install</button>
        <button className="x" type="button" aria-label="Dismiss" onClick={() => { setHidden(true); try { localStorage.setItem("stoa-install-dismissed", "1"); } catch { /* storage off */ } }}>×</button>
      </div>
    );
  }
  return <><button type="button" className="linkbtn" style={{ textAlign: "left", textDecoration: "none" }} onClick={install}>Install the app</button>{steps}</>;
}

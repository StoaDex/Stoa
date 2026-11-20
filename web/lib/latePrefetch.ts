"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Idle = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };

/** Prefetch these routes only after the page has loaded and the browser is idle. Links prefetch the moment they
 *  scroll into view, which on a phone means the tab bar's five pages download while this page's own code still is;
 *  this keeps tab switches instant without slowing the first load. Pair with <Link prefetch={false}>. */
export function useLatePrefetch(hrefs: readonly string[]) {
  const router = useRouter();
  const key = hrefs.join("|");
  useEffect(() => {
    const w = window as Idle;
    let id = 0;
    let t: ReturnType<typeof setTimeout> | undefined;
    const run = () => key.split("|").forEach((h) => { try { router.prefetch(h); } catch { /* offline */ } });
    const go = () => { if (w.requestIdleCallback) id = w.requestIdleCallback(run, { timeout: 4000 }); else t = setTimeout(run, 1500); };
    if (document.readyState === "complete") go(); else addEventListener("load", go, { once: true });
    return () => { removeEventListener("load", go); if (id) w.cancelIdleCallback?.(id); if (t) clearTimeout(t); };
  }, [key, router]);
}

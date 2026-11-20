"use client";
import { useEffect } from "react";
import { cleanRef } from "./swap";

/** A ?ref=<wallet> on the page is remembered like on Trade (localStorage stoa.ref), so the swap that follows pays it. */
export function useRefFromUrl() {
  useEffect(() => {
    const r = cleanRef(new URLSearchParams(location.search).get("ref"));
    if (r) try { localStorage.setItem("stoa.ref", r); } catch { /* storage blocked */ }
  }, []);
}

/** The system share sheet where there is one, the clipboard otherwise. "copied" when the link went to the clipboard. */
export async function shareOrCopy(url: string, text: string): Promise<"shared" | "copied" | "none"> {
  try {
    if (typeof navigator.share === "function") { await navigator.share({ title: "Stoa", text, url }); return "shared"; }
  } catch { return "none"; /* closed the share sheet */ }
  try { await navigator.clipboard.writeText(url); return "copied"; } catch { return "none"; /* clipboard blocked */ }
}

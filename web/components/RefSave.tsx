"use client";
import { useEffect } from "react";
import { cleanRef } from "@/lib/swap";

/** Remembers the referrer named in an invite link's path (/r/<wallet>), the same way ?ref= does. Renders nothing. */
export default function RefSave({ address }: { address: string }) {
  useEffect(() => {
    const r = cleanRef(address);
    if (r) try { localStorage.setItem("stoa.ref", r); } catch { /* storage blocked */ }
  }, [address]);
  return null;
}

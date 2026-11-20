"use client";
import { useRefFromUrl } from "@/lib/share";

/** Remembers a ?ref=<wallet> on server-rendered pages, so the swap that follows pays the referrer. Renders nothing. */
export default function RefKeeper() {
  useRefFromUrl();
  return null;
}

"use client";
import Link from "next/link";
import { left } from "@/lib/spotlight";
import { SEASON_START } from "@/lib/pointsScore";
import { useNow } from "./spotlightData";

/** One line about Points season 1: the countdown before it starts, then a link to the board. Same look as the Spotlight
 *  banner it sits under. Renders nothing until mounted. */
export default function PointsBanner({ variant = "bar" }: { variant?: "pill" | "bar" }) {
  const now = useNow(30_000);
  if (now === 0) return null;
  const before = now < SEASON_START;
  const text = before
    ? (variant === "pill" ? `Points start in ${left(SEASON_START - now)}` : `Points season 1 starts in ${left(SEASON_START - now)}`)
    : (variant === "pill" ? "Points season 1 is live" : "Points season 1 is live: swaps and referrals earn points");
  return (
    <Link href="/points" prefetch={false} className={`spotban ${variant}`} aria-label={`${text}. ${before ? "How it works" : "See the board"}`}>
      <span className="sb-dot" aria-hidden="true" style={{ background: "#15803d", boxShadow: "0 0 0 4px rgba(31,157,85,.15)" }} />
      <span className="sb-t">{text}</span>
      <span className="sb-go">{before ? "How it works" : "See the board"} →</span>
    </Link>
  );
}

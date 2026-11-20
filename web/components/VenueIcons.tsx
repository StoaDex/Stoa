/* Venue logos: each venue's own mark, shown only to name the venue a swap compares */
/** The logos for a "Filled by" name such as "Uniswap V3 → Ramses" */
export function venueIds(name: string): string[] {
  const n = name.toLowerCase(), out: string[] = [];
  if (n.includes("stoa") || n.includes("maker")) out.push("stoa");
  if (n.includes("uniswap")) out.push("uniswap");
  if (n.includes("aero")) out.push("aero");
  if (n.includes("ramses")) out.push("ramses");
  if (n.includes("liquidity book") || /\blb\b/.test(n)) out.push("lb");
  if (n.includes("pons")) out.push("pons");
  if (n.includes("metric")) out.push("metric"); // no published mark: a plain initial
  return out;
}

/** Venue logos (each venue's own mark, shown to name the venue) beside a row in the venue list */
const VENUE_ICON: Record<string, string> = {
  stoa: "/stoa-logo-200.png", uniswap: "/venues/uniswap.webp", aero: "/venues/aero.webp",
  ramses: "/venues/ramses.webp", lb: "/venues/lb.webp", pons: "/venues/pons.webp", metric: "/venues/metric.svg",
};
export function VenueIcons({ ids }: { ids: readonly string[] }) {
  const srcs = ids.map((i) => VENUE_ICON[i]).filter(Boolean);
  if (!srcs.length) return null;
  return (
    <span className="vi" aria-hidden="true">
      {srcs.map((src) => <img key={src} src={src} alt="" width={22} height={22} loading="lazy" className={src === VENUE_ICON.stoa ? "mark" : undefined} />)}
    </span>
  );
}

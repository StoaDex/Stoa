import type { MetadataRoute } from "next";

/** Lets phones and desktop browsers install Stoa as an app ("Add to Home Screen"): opens on Trade, full screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stoa: every route, compared",
    short_name: "Stoa",
    description: "Swap on Robinhood Chain and Elysium. Every venue the router uses, compared on every swap.",
    id: "/",
    start_url: "/trade",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFF6E9",
    theme_color: "#EEF2F6",
    categories: ["finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Trade", url: "/trade", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Portfolio", url: "/portfolio", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "$STOA", url: "/token", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}

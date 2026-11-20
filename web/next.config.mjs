// anvil end-to-end tests over http (plain local chain, or a local fork of Elysium)
const LOCAL = process.env.NEXT_PUBLIC_CHAIN_ID === "31337" || /^http:\/\/(127\.0\.0\.1|localhost)/.test(process.env.NEXT_PUBLIC_RPC_URL || "");

// Content Security Policy: no third-party scripts; network only to RPCs/wallet relays over https/wss.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:" + (LOCAL ? " http://127.0.0.1:8545 http://localhost:8545" : ""),
  "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org https://stoadex-stoa-dashboard.static.hf.space",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(LOCAL ? [] : ["upgrade-insecure-requests"]),
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // the docs are read from disk at request time (the sitemap is regenerated hourly): ship them with those functions,
  // or a regeneration fails with ENOENT and search engines get a 500 for /sitemap.xml
  outputFileTracingIncludes: {
    "/sitemap.xml": ["./content/docs/**/*"],
    "/docs/[slug]": ["./content/docs/**/*"],
  },
  // WalletConnect's logger optionally requires these; they are not needed in the browser
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  // the swap screen lives at /trade; /swap/<chain>/<tx> are shared swap pages, so only these two shorter forms move
  async redirects() {
    return [
      { source: "/swap", destination: "/trade", permanent: false },
      { source: "/swap/:chain(robinhood|elysium)", destination: "/trade?chain=:chain", permanent: false },
    ];
  },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    ];
    return [
      // the buy widget is the only page other sites may frame; it never connects a wallet (Buy opens Stoa in a new tab)
      {
        // the service worker must always be fresh so a new version can replace the old one
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }],
      },
      {
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: CSP.replace("frame-ancestors 'none'", "frame-ancestors *") }, ...common],
      },
      {
        source: "/((?!embed/).*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
};
export default nextConfig;

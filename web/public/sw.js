/* Stoa service worker: makes the installed app open fast and survive a weak signal.
 * - Build files (/_next/static, hashed and never changed) and images: served from the cache, fetched once.
 * - Pages: always from the network first; the last good copy only when the network fails, then an offline page.
 * - Everything else (APIs, quotes, RPC, link cards) is never touched: prices and balances always come live. */
const VERSION = "stoa-v1";
const STATIC = `${VERSION}-static`, PAGES = `${VERSION}-pages`;
const OFFLINE = "/offline.html"; // plain HTML, no scripts: it works with nothing else cached

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll([new Request(OFFLINE, { cache: "reload" }), new Request("/logo.png", { cache: "reload" })])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isStatic = (u) => u.pathname.startsWith("/_next/static/") || /^\/(icons|tokens|networks|wallets)\//.test(u.pathname) || u.pathname === "/logo.png";

// build files from old deploys pile up: keep the newest few hundred
async function trim(c, max) {
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await c.delete(k);
}

async function scriptsCached(res) {
  const html = await res.text();
  const c = await caches.open(STATIC);
  for (const [tag] of html.matchAll(/<script[^>]*>/g)) {
    const src = /src="(\/_next\/static\/[^"]+\.js)"/.exec(tag);
    if (src && !/nomodule/i.test(tag) && !(await c.match(src[1]))) return false; // old-browser polyfills never load
  }
  return true;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isStatic(url)) {
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { const copy = res.clone(); e.waitUntil(c.put(req, copy).then(() => trim(c, 400))); }
      return res;
    }));
    return;
  }

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && res.type === "basic") { const copy = res.clone(); e.waitUntil(caches.open(PAGES).then((c) => c.put(req, copy))); }
        return res;
      } catch {
        // the last good copy of this page if its scripts are cached too, otherwise the plain offline page
        const page = await caches.match(req);
        if (page && (await scriptsCached(page.clone()))) return page;
        return (await caches.match(OFFLINE)) || Response.error();
      }
    })());
  }
});

// a price alert notification opens (or focuses) Stoa on the token's trade page
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin);
  if (url.origin !== self.location.origin) return;
  e.waitUntil((async () => {
    for (const c of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
      if (new URL(c.url).origin === url.origin && "focus" in c) { await c.focus(); if ("navigate" in c) await c.navigate(url.href); return; }
    }
    await self.clients.openWindow(url.href);
  })());
});

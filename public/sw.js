/**
 * Modrek Plus – Smart Cache Service Worker
 * - HLS video segments (.ts / .m4s) → CacheFirst, LRU ~200MB
 * - HLS manifests (.m3u8) → NetworkFirst (short TTL — manifests change)
 * - Thumbnails / images (bunny CDN, supabase storage) → CacheFirst
 * - HTML navigations → NetworkFirst (no stale shell)
 * - Supabase REST/realtime → NEVER cached
 */
const VERSION = "v1";
const SEG_CACHE = `mp-seg-${VERSION}`;
const IMG_CACHE = `mp-img-${VERSION}`;
const HTML_CACHE = `mp-html-${VERSION}`;
const MAX_SEGMENTS = 220; // ~roughly 200MB at ~1MB/segment

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith("mp-") && !k.endsWith(VERSION)).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    for (let i = 0; i < keys.length - maxEntries; i++) {
      await cache.delete(keys[i]);
    }
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache Supabase API / auth / realtime
  if (url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".supabase.in")) return;

  const isSegment = /\.(ts|m4s)(\?|$)/i.test(url.pathname);
  const isManifest = /\.m3u8(\?|$)/i.test(url.pathname);
  const isImage = /\.(jpg|jpeg|png|webp|avif|gif|svg)(\?|$)/i.test(url.pathname);
  const isHtml = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  if (isSegment) {
    // Range requests: just pass through to network — caching ranges is fragile
    if (req.headers.get("range")) return;
    event.respondWith((async () => {
      const cache = await caches.open(SEG_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const resp = await fetch(req);
        if (resp.ok) {
          cache.put(req, resp.clone()).then(() => trimCache(SEG_CACHE, MAX_SEGMENTS));
        }
        return resp;
      } catch (e) {
        return hit || Response.error();
      }
    })());
    return;
  }

  if (isManifest) {
    event.respondWith((async () => {
      try {
        const resp = await fetch(req);
        return resp;
      } catch {
        const cache = await caches.open(SEG_CACHE);
        return (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }

  if (isImage && (url.hostname.endsWith(".b-cdn.net") || url.hostname.endsWith(".supabase.co"))) {
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const resp = await fetch(req);
        if (resp.ok) {
          cache.put(req, resp.clone()).then(() => trimCache(IMG_CACHE, 300));
        }
        return resp;
      } catch {
        return hit || Response.error();
      }
    })());
    return;
  }

  if (isHtml) {
    event.respondWith((async () => {
      try {
        const resp = await fetch(req);
        const cache = await caches.open(HTML_CACHE);
        cache.put(req, resp.clone());
        return resp;
      } catch {
        const cache = await caches.open(HTML_CACHE);
        return (await cache.match(req)) || caches.match("/");
      }
    })());
  }
});

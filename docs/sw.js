// Shell precache plus every documentation page, so the docs work offline
// once they have been opened. No push and no background sync here; that is
// the main site's job.

const CACHE = "uwufeed-docs-v2";

const SHELL = [
  "/",
  "/index.html",
  "/css/theme.css",
  "/css/docs.css",
  "/js/theme-preload.js",
  "/js/theme.js",
  "/js/icons.js",
  "/js/ui.js",
  "/js/nav.js",
  "/js/markdown.js",
  "/js/search.js",
  "/js/app.js",
  "/UFD-main.png",
  "/favicon.ico",
  "/manifest.json",
];

// Keep in step with SECTIONS in js/nav.js. A page missing here still works
// online and is simply absent offline.
const CONTENT = [
  "/content/introduction.md",
  "/content/quick-start.md",
  "/content/how-it-works.md",
  "/content/web-overview.md",
  "/content/web-sources.md",
  "/content/web-opml.md",
  "/content/web-notifications.md",
  "/content/web-themes.md",
  "/content/telegram-overview.md",
  "/content/telegram-commands.md",
  "/content/telegram-running.md",
  "/content/discord-overview.md",
  "/content/discord-commands.md",
  "/content/discord-running.md",
  "/content/workers-overview.md",
  "/content/workers-dispatcher.md",
  "/content/workers-poller.md",
  "/content/workers-streams.md",
  "/content/item-shape.md",
  "/content/shared-auth.md",
  "/content/self-hosting.md",
  "/content/faq.md",
  "/next-steps.md",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll(SHELL);
        // Content is added individually, so one missing file does not fail
        // the whole install and leave the docs with no cache at all.
        await Promise.all(
          CONTENT.map((path) => cache.add(path).catch(() => undefined))
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Markdown is stale while revalidate: instant from cache, updated in the
  // background, so an edit shows up on the next visit.
  if (url.origin === self.location.origin && url.pathname.endsWith(".md")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || network;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (request.mode === "navigate") return caches.match("/index.html");
    return new Response("Offline", { status: 503 });
  }
}

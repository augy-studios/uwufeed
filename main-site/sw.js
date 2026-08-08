// Shell precache, the most recent 50 items, and web push.
// No offline outbox and no background sync, on purpose.

const SHELL_CACHE = "uwufeed-shell-v9";
const ITEMS_CACHE = "uwufeed-items-v1";
const ITEMS_ENDPOINT = "/api/items/list";

const ASSETS = [
  "/",
  "/index.html",
  "/404.html",
  "/404.css",
  "/css/theme.css",
  "/css/app.css",
  "/js/theme-preload.js",
  "/js/theme.js",
  "/js/icons.js",
  "/js/ui.js",
  "/js/api.js",
  "/js/feed.js",
  "/js/sources.js",
  "/js/destinations.js",
  "/js/opml.js",
  "/js/push.js",
  "/js/passkey.js",
  "/js/auth.js",
  "/js/app.js",
  "/UFD-main.png",
  "/favicon.ico",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL_CACHE && k !== ITEMS_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // The timeline: network first, and keep the last good response so a cold
  // start offline still shows something.
  if (url.origin === self.location.origin && url.pathname === ITEMS_ENDPOINT) {
    event.respondWith(itemsNetworkFirst(request));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(networkOnly(request));
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  }
});

async function itemsNetworkFirst(request) {
  const cache = await caches.open(ITEMS_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(ITEMS_ENDPOINT, response.clone());
    return response;
  } catch {
    const cached = await cache.match(ITEMS_ENDPOINT);
    if (cached) return cached;
    return new Response(JSON.stringify({ items: [], offline: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (request.mode === "navigate") return caches.match("/index.html");
    return new Response("Offline", { status: 503 });
  }
}

// ---- web push ----

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "uwuFeed", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "uwuFeed";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: payload.icon || "/UFD-main.png",
      badge: "/UFD-main.png",
      image: payload.thumbnail_url || undefined,
      // Collapse repeats of the same item into one notification.
      tag: payload.external_id || payload.url || title,
      renotify: false,
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

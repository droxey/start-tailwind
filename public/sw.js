// Service worker: offline app shell, push notifications, and notification taps.
// API responses are never cached, so the dashboard always shows live data or an error.

const CACHE = "fire-sale-v1";
const SHELL = [
  "./",
  "assets/site.css",
  "js/app.js",
  "js/lib.js",
  "js/charts.js",
  "js/upload.js",
  "js/pwa.js",
  "js/main.js",
  "favicon.svg",
  "manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== location.origin ||
    url.pathname.includes("/api/")
  )
    return;
  // Network first, so a fresh deploy shows up at once. The cache is the offline fallback.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit ?? caches.match("./"))),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Fire Sale", body: "Something needs you." };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // keep the default text
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      data: { url: data.tag?.startsWith("chat") ? "./" : "./#queue" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "./", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.registration.scope));
      if (open) return open.focus().then((w) => w.navigate(target));
      return self.clients.openWindow(target);
    }),
  );
});

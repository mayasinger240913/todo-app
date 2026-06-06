// Service Worker בסיסי — נדרש כדי שאפשר יהיה "להתקין" את האפליקציה.
// שומר עותק של מעטפת האפליקציה (cache) כדי שתיפתח מהר.
const CACHE = "todo-v1";
const ASSETS = [
  "/",
  "/static/style.css",
  "/static/app.js",
  "/static/manifest.json",
  "/static/icon-192.png",
  "/static/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // בקשות API ותמונות — תמיד מהרשת (מידע עדכני)
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) {
    return; // ברירת מחדל: מהרשת
  }
  // שאר הקבצים — קודם מהרשת, ואם אין אינטרנט אז מה-cache
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

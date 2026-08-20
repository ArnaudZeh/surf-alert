/*
 * Service worker minimal : met en cache l'app shell (HTML/CSS/JS/icones)
 * pour l'installation PWA et un ouverture hors-ligne basique. Les appels
 * Open-Meteo (cross-origin) ne sont jamais interceptes : les conditions de
 * surf doivent toujours venir du reseau, jamais d'un cache perime.
 */

const CACHE_NAME = "surf-alert-shell-v22";

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./css/tokens.css",
  "./css/styles.css",
  "./js/format.js",
  "./js/api.js",
  "./js/score.js",
  "./js/insights.js",
  "./js/app.js",
  "./data/spots.json",
  "./manifest.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Cross-origin (Open-Meteo, Google Fonts...) : laisser passer normalement.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      });
    })
  );
});

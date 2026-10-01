const SHELL = "shell";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  if (event.data?.type === "keep") event.waitUntil(keep(event.data.urls));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (navigator.onLine || request.method !== "GET" || new URL(request.url).origin !== location.origin) return;
  event.respondWith(fromCache(request));
});

async function keep(urls) {
  const cache = await caches.open(SHELL);
  await cache.addAll(urls);
  for (const request of await cache.keys()) {
    if (!urls.includes(request.url)) await cache.delete(request);
  }
}

async function fromCache(request) {
  return (await caches.match(request, { ignoreSearch: request.mode === "navigate" })) ?? fetch(request);
}

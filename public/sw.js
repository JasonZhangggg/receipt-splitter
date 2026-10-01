const KILL = false;
const SHELL = "shell";
const shellPaths = ["/", "/ocr-worker.mjs", "/favicon.ico"];
const staticFolders = ["/_expo/static/", "/fonts/", "/assets/", "/ort/"];

self.addEventListener("install", () => self.skipWaiting());

if (KILL) {
  self.addEventListener("activate", (event) => event.waitUntil(retire()));
} else {
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener("message", (event) => {
    if (event.data?.type === "keep" && Array.isArray(event.data.urls)) event.waitUntil(keep(event.data.urls.filter(isKeepable)));
  });

  self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (navigator.onLine || request.method !== "GET" || new URL(request.url).origin !== location.origin) return;
    event.respondWith(fromCache(request));
  });
}

async function retire() {
  for (const name of await caches.keys()) await caches.delete(name);
  await self.registration.unregister();
}

function isKeepable(href) {
  if (typeof href !== "string" || !URL.canParse(href)) return false;
  const { origin, pathname } = new URL(href);
  if (origin !== location.origin) return false;
  return shellPaths.includes(pathname) || (staticFolders.some((folder) => pathname.startsWith(folder)) && !pathname.endsWith(".wasm"));
}

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

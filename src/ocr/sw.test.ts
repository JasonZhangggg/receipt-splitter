import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const origin = "https://split.test";

type Listener = (event: object) => void;

function fakeCaches(seed: Record<string, string[]>) {
  const stores = new Map(Object.entries(seed).map(([name, urls]) => [name, new Map(urls.map((url) => [url, `body of ${url}`]))]));
  const store = (name: string) => stores.get(name) ?? stores.set(name, new Map()).get(name)!;
  return {
    open: async (name: string) => ({
      addAll: async (urls: string[]) => urls.forEach((url) => store(name).set(url, `body of ${url}`)),
      keys: async () => [...store(name).keys()].map((url) => ({ url })),
      delete: async ({ url }: { url: string }) => store(name).delete(url),
    }),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async ({ url }: { url: string }) => [...stores.values()].find((cache) => cache.has(url))?.get(url),
    contents: () => Object.fromEntries([...stores].map(([name, cache]) => [name, [...cache.keys()]])),
  };
}

function startWorker({ kill = false, seed = {} }: { kill?: boolean; seed?: Record<string, string[]> } = {}) {
  const switched = source.replace("const KILL = false;", `const KILL = ${kill};`);
  if (!switched.includes(`const KILL = ${kill};`)) throw new Error("sw.js has no KILL switch");
  const listeners = new Map<string, Listener>();
  const caches = fakeCaches(seed);
  const navigator = { onLine: true };
  const state = { unregistered: false };
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    registration: { unregister: async () => (state.unregistered = true) },
  };
  new Function("self", "caches", "location", "navigator", "fetch", switched)(self, caches, { origin }, navigator, async () => "from network");

  async function dispatch(type: string, event: object = {}) {
    const pending: Promise<unknown>[] = [];
    let answer: Promise<unknown> | null = null;
    listeners.get(type)?.({ ...event, waitUntil: (promise: Promise<unknown>) => pending.push(promise), respondWith: (response: Promise<unknown>) => (answer = response) });
    await Promise.all(pending);
    return answer === null ? null : await answer;
  }

  const fetchOffline = (url: string) => {
    navigator.onLine = false;
    return dispatch("fetch", { request: { url, method: "GET", mode: "navigate" } });
  };

  return { caches, state, dispatch, fetchOffline };
}

describe("the service worker", () => {
  test("keeps only same-origin app shell and static files, never an API, socket, Split page, or foreign file", async () => {
    const worker = startWorker();
    await worker.dispatch("message", {
      data: {
        type: "keep",
        urls: [
          `${origin}/`,
          `${origin}/ocr-worker.mjs`,
          `${origin}/favicon.ico`,
          `${origin}/_expo/static/js/web/entry-abc.js`,
          `${origin}/fonts/plus-jakarta-sans-400.woff2`,
          `${origin}/assets/error.png`,
          `${origin}/ort/ort.wasm.min.mjs`,
          `${origin}/ort/ort-wasm-simd-threaded.wasm`,
          `${origin}/api/splits`,
          `${origin}/parties/split-server/q7Xv0Lr9_aZ-3mKpAbCdEf`,
          `${origin}/s/q7Xv0Lr9_aZ-3mKpAbCdEf`,
          `${origin}/fonts/../api/splits`,
          `${origin}/sw.js`,
          "https://evil.test/_expo/static/js/web/entry-abc.js",
          "not a url",
        ],
      },
    });

    expect(worker.caches.contents()).toEqual({
      shell: [
        `${origin}/`,
        `${origin}/ocr-worker.mjs`,
        `${origin}/favicon.ico`,
        `${origin}/_expo/static/js/web/entry-abc.js`,
        `${origin}/fonts/plus-jakarta-sans-400.woff2`,
        `${origin}/assets/error.png`,
        `${origin}/ort/ort.wasm.min.mjs`,
      ],
    });
  });

  test("answers a kept page from its cache while offline", async () => {
    const worker = startWorker({ seed: { shell: [`${origin}/`] } });

    expect(await worker.fetchOffline(`${origin}/`)).toBe(`body of ${origin}/`);
  });

  test("with KILL set, deletes every cache, unregisters, and answers nothing while offline", async () => {
    const worker = startWorker({ kill: true, seed: { shell: [`${origin}/`], "ocr-models": [`${origin}/models/det.onnx`] } });
    await worker.dispatch("install");
    await worker.dispatch("activate");

    expect(worker.caches.contents()).toEqual({});
    expect(worker.state.unregistered).toBe(true);
    expect(await worker.fetchOffline(`${origin}/`)).toBe(null);
  });
});

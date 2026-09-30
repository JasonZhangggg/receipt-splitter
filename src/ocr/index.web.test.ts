import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Client = typeof import("./index.web");

class FakeWorker {
  static started: FakeWorker[] = [];
  static connect: (worker: FakeWorker) => void = () => {};
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { message: string }) => void;
  terminated = false;

  constructor() {
    FakeWorker.started.push(this);
    FakeWorker.connect(this);
  }

  postMessage(_message: unknown) {}

  terminate() {
    this.terminated = true;
  }
}

let client: Client;

beforeEach(async () => {
  FakeWorker.started = [];
  FakeWorker.connect = () => {};
  vi.stubGlobal("Worker", FakeWorker);
  vi.resetModules();
  client = await import("./index.web");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a worker that crashes rejects every pending scan, and the next scan starts a new worker", async () => {
  const first = client.recognize(new Blob());
  const second = client.recognize(new Blob());
  const [crashed] = FakeWorker.started;

  crashed.onerror?.({ message: "boom at load" });

  await expect(first).rejects.toThrow("boom at load");
  await expect(second).rejects.toThrow("boom at load");
  expect(crashed.terminated).toBe(true);
  void client.recognize(new Blob());
  expect(FakeWorker.started).toHaveLength(2);
});

test("a scan rejects with the worker's error for that scan, and the next scan downloads the models again", async () => {
  const workerScope = globalThis as unknown as { onmessage(event: { data: unknown }): void };
  FakeWorker.connect = (fake) => {
    fake.postMessage = (data) => workerScope.onmessage({ data });
    vi.stubGlobal("postMessage", (data: unknown) => fake.onmessage?.({ data }));
  };
  let dict = new Response("", { status: 404 });
  vi.stubGlobal("caches", undefined);
  vi.stubGlobal("fetch", async (url: string) =>
    url.endsWith(".dict.txt") ? dict : new Response("bytes", { headers: { "content-type": "application/octet-stream" } }),
  );
  await import("../../public/ocr-worker.mjs");

  await expect(client.recognize(new Blob())).rejects.toThrow(/en_PP-OCRv5_rec_mobile\.dict\.txt returned 404$/);

  dict = new Response("<!DOCTYPE html>", { headers: { "content-type": "text/html" } });
  await expect(client.recognize(new Blob())).rejects.toThrow(/en_PP-OCRv5_rec_mobile\.dict\.txt returned an HTML page$/);
});

class FakePaintObserver {
  static instances: FakePaintObserver[] = [];
  observed: unknown[] = [];
  disconnected = false;

  constructor(private callback: (list: { getEntriesByName(name: string): string[] }, observer: FakePaintObserver) => void) {
    FakePaintObserver.instances.push(this);
  }

  observe(options: unknown) {
    this.observed.push(options);
  }

  disconnect() {
    this.disconnected = true;
  }

  report(...names: string[]) {
    this.callback({ getEntriesByName: (name) => names.filter((entry) => entry === name) }, this);
  }
}

describe("model prefetch", () => {
  const onLoad: (() => void)[] = [];

  beforeEach(() => {
    FakePaintObserver.instances = [];
    onLoad.length = 0;
    vi.stubGlobal("PerformanceObserver", FakePaintObserver);
    vi.stubGlobal("addEventListener", (type: string, listener: () => void) => type === "load" && onLoad.push(listener));
  });

  test("starts only after the first contentful paint and the load event", () => {
    vi.stubGlobal("document", { readyState: "interactive" });

    client.prefetchModel();
    const [observer] = FakePaintObserver.instances;
    const started = [FakeWorker.started.length];
    observer.report("first-paint");
    started.push(FakeWorker.started.length);
    observer.report("first-contentful-paint");
    started.push(FakeWorker.started.length);
    onLoad.forEach((listener) => listener());
    started.push(FakeWorker.started.length);

    expect(started).toEqual([0, 0, 0, 1]);
  });

  test("on a page that already finished loading, waits for the first contentful paint and starts once", () => {
    vi.stubGlobal("document", { readyState: "complete" });

    client.prefetchModel();
    const [observer] = FakePaintObserver.instances;
    const started = [FakeWorker.started.length];
    observer.report("first-paint");
    started.push(FakeWorker.started.length);
    observer.report("first-paint", "first-contentful-paint");
    started.push(FakeWorker.started.length);

    expect(started).toEqual([0, 0, 1]);
    expect(onLoad).toHaveLength(0);
  });

  test("observes paint entries recorded before the page subscribed, and stops observing once it fires", () => {
    vi.stubGlobal("document", { readyState: "complete" });

    client.prefetchModel();
    const [observer] = FakePaintObserver.instances;
    const before = observer.disconnected;
    observer.report("first-paint");
    const afterFirstPaint = observer.disconnected;
    observer.report("first-contentful-paint");

    expect(observer.observed).toEqual([{ type: "paint", buffered: true }]);
    expect([before, afterFirstPaint, observer.disconnected]).toEqual([false, false, true]);
  });

  test("is skipped without error where PerformanceObserver does not exist", () => {
    vi.stubGlobal("PerformanceObserver", undefined);

    expect(() => client.prefetchModel()).not.toThrow();
    expect(FakeWorker.started).toHaveLength(0);
  });
});

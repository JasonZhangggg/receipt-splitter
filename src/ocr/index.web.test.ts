import { afterEach, beforeEach, expect, test, vi } from "vitest";

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

test("a scan rejects with the worker's error for that scan", async () => {
  const workerScope = globalThis as unknown as { onmessage(event: { data: unknown }): void };
  FakeWorker.connect = (fake) => {
    fake.postMessage = (data) => workerScope.onmessage({ data });
    vi.stubGlobal("postMessage", (data: unknown) => fake.onmessage?.({ data }));
  };
  vi.stubGlobal("caches", undefined);
  vi.stubGlobal("fetch", async (url: string) =>
    url.endsWith(".dict.txt") ? new Response("", { status: 404 }) : new Response("bytes", { headers: { "content-type": "application/octet-stream" } }),
  );
  await import("../../public/ocr-worker.mjs");

  await expect(client.recognize(new Blob())).rejects.toThrow(/en_PP-OCRv5_rec_mobile\.dict\.txt returned 404$/);
});

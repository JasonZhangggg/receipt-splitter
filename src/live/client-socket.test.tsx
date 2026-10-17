// @vitest-environment happy-dom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Operation } from "../core/operations";
import { useLiveSplit } from "./client";

const id = "abcdefghjkmnpqrstuvwxy";
const op = { by: null, type: "setPaymentHandles", handles: [] } as unknown as Operation;

/** A socket the test drives by hand: it stays CONNECTING until `open()`. */
class FakeSocket extends EventTarget {
  static all: FakeSocket[] = [];
  readyState = 0;
  binaryType = "blob";
  sent: string[] = [];
  constructor(readonly url: string) {
    super();
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
}

let host: HTMLElement;
let root: Root;
let api: ReturnType<typeof useLiveSplit>;

function Probe() {
  const live = useLiveSplit(id);
  useEffect(() => {
    api = live;
  });
  return null;
}

const nextSocket = async (count: number) => vi.waitFor(() => expect(FakeSocket.all).toHaveLength(count), { timeout: 3000 });

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  FakeSocket.all = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(Probe)));
  await nextSocket(1);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("an action sent before the first open goes out when the socket opens", async () => {
  const answer = api.send(op);
  expect(FakeSocket.all[0].sent).toEqual([]);

  await act(async () => FakeSocket.all[0].open());

  expect(FakeSocket.all[0].sent.map((frame) => JSON.parse(frame).op.type)).toEqual(["setPaymentHandles"]);
  void answer;
});

it("an action sent before the first open and answered 'disconnected' when that connect fails does not go out when the socket reconnects", async () => {
  const answer = api.send(op);

  await act(async () => FakeSocket.all[0].dispatchEvent(new Event("error")));
  await expect(answer).resolves.toEqual({ ok: false, rejection: { reason: "disconnected" } });

  await nextSocket(2);
  await act(async () => FakeSocket.all[1].open());

  expect(FakeSocket.all[0].sent).toEqual([]);
  expect(FakeSocket.all[1].sent).toEqual([]);
});

it("after the socket has opened once, an action sent while it is down is refused at once", async () => {
  await act(async () => FakeSocket.all[0].open());
  await act(async () => FakeSocket.all[0].dispatchEvent(new Event("error")));
  await nextSocket(2);

  await expect(api.send(op)).resolves.toEqual({ ok: false, rejection: { reason: "disconnected" } });
  expect(FakeSocket.all[1].sent).toEqual([]);
});

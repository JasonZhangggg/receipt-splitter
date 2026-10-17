import { afterEach, expect, test, vi } from "vitest";

import type { ServerMessage } from "../core/operations";
import type { Split } from "../core/split";
import { firstSight, forgetFirstSight, keepCreated, takeEarlySocket } from "./first-sight";

const id = "abcdefghjkmnpqrstuvwxy";
const split = { id, revision: 0, participants: [] } as unknown as Split;
const state = (revision: number): ServerMessage => ({ type: "state", ref: null, photo: false, split: { ...split, revision } });

/** What public/index.html leaves on the window: a socket (here an EventTarget) and the events it saw. */
class FakeSocket extends EventTarget {
  closed = false;
  close() {
    this.closed = true;
  }
}

function early(events: Event[], at = id) {
  const ws = new FakeSocket();
  const record = { id: at, ws: ws as unknown as WebSocket, events };
  vi.stubGlobal("window", { splitwithSocket: record });
  return { ws, record };
}

const message = (body: ServerMessage) => new MessageEvent("message", { data: JSON.stringify(body) });

afterEach(() => {
  forgetFirstSight(id);
  vi.unstubAllGlobals();
});

test("a Split just created is what the Host's page shows first, until the server's state replaces it", () => {
  expect(firstSight(id)).toBeNull();
  keepCreated(split);
  expect(firstSight(id)).toEqual({ split, photo: false });
  forgetFirstSight(id);
  expect(firstSight(id)).toBeNull();
});

test("a friend's page shows the state the early socket already received, and nothing for a socket that heard none", () => {
  early([new Event("open")]);
  expect(firstSight(id)).toBeNull();

  early([new Event("open"), message(state(3)), message(state(5))]);
  expect(firstSight(id)?.split.revision).toBe(5);
});

test("the early socket of another Split is not shown, and is closed when a page for this one starts", () => {
  const { ws } = early([message(state(3))], "zzzzzzzzzzzzzzzzzzzzzz");
  expect(firstSight(id)).toBeNull();
  expect(takeEarlySocket(id)).toBeUndefined();
  expect(ws.closed).toBe(true);
});

test("PartySocket's first connection gets the early socket with its events replayed after its listeners are on, and a reconnect gets a new socket", async () => {
  const fresh = vi.fn();
  vi.stubGlobal("WebSocket", class { constructor(readonly url: string) { fresh(url); } });
  const { ws } = early([new Event("open"), message(state(3))]);
  const Adopted = takeEarlySocket(id)!.socket;

  const first = new Adopted("ws://x/room");
  expect(first).toBe(ws);
  const seen: string[] = [];
  ws.addEventListener("open", () => seen.push("open"));
  ws.addEventListener("message", (event) => seen.push(`message ${(JSON.parse((event as MessageEvent).data) as { split: Split }).split.revision}`));
  expect(seen).toEqual([]);
  await Promise.resolve();
  expect(seen).toEqual(["open", "message 3"]);

  ws.dispatchEvent(message(state(4)));
  expect(seen.at(-1)).toBe("message 4");

  expect(new Adopted("ws://x/room")).not.toBe(ws);
  expect(fresh).toHaveBeenCalledWith("ws://x/room");
  expect(takeEarlySocket(id)).toBeUndefined();
});

test("an effect that cleans up before PartySocket's first connect closes the early socket and stops its recording", () => {
  const { ws, record } = early([new Event("open")]);
  const taken = takeEarlySocket(id)!;
  taken.release();
  expect(ws.closed).toBe(true);
  expect(record.events).toBeNull();
  expect(new taken.socket("ws://x/room")).not.toBe(ws);
});

test("once PartySocket has taken the early socket, release leaves it open", () => {
  vi.stubGlobal("WebSocket", class {});
  const { ws } = early([new Event("open")]);
  const taken = takeEarlySocket(id)!;
  expect(new taken.socket("ws://x/room")).toBe(ws);
  taken.release();
  expect(ws.closed).toBe(false);
});

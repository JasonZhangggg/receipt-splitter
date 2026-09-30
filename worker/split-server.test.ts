import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientMessage, ServerMessage } from "../src/core/operations";
import type { Split } from "../src/core/split";
import { connect, createSplit, leftovers, stubSiteverify, type Client } from "./testing";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-10-01T12:00:00Z");

beforeEach(() => {
  vi.setSystemTime(T0);
  stubSiteverify();
});

const claim = (ref: string, itemId: string, participantId = "ann"): ClientMessage =>
  JSON.parse(JSON.stringify({ ref, op: { type: "claim", by: participantId, itemId, participantId } }));

async function open(id: string): Promise<{ client: Client; hello: ServerMessage }> {
  const client = await connect(id);
  return { client, hello: await client.next() };
}

async function storedRow(id: string): Promise<unknown> {
  return runInDurableObject(env.SplitServer.getByName(id), (_, state) =>
    state.storage.sql.exec("SELECT json, changed_at FROM split").toArray(),
  );
}

describe("two clients on one Split", () => {
  it("each receive the other's Claim as the new state, the sender tagged with its ref", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    const b = await open(id);
    expect(a.hello).toMatchObject({ type: "state", ref: null, split: { id, revision: 0 } });

    a.client.send(claim("a1", "fries"));
    const toSender = await a.client.next();
    const toOther = await b.client.next();
    expect(toSender).toMatchObject({ type: "state", ref: "a1" });
    expect(toOther).toMatchObject({ type: "state", ref: null });
    if (toOther.type !== "state") throw new Error("expected state");
    expect(toOther.split.revision).toBe(1);
    expect(toOther.split.receipt.items.map(({ id: itemId, claimedBy }) => [itemId, claimedBy])).toEqual([
      ["fries", ["ann"]],
      ["pitcher", []],
    ]);

    b.client.send(claim("b1", "pitcher"));
    expect(await b.client.next()).toMatchObject({ type: "state", ref: "b1", split: { revision: 2 } });
    const seenByA = await a.client.next();
    if (seenByA.type !== "state") throw new Error("expected state");
    expect(seenByA.split.receipt.items.map(({ claimedBy }) => claimedBy)).toEqual([["ann"], ["ann"]]);
  });

  it("answers an operation that changes nothing to the sender alone, with the current revision", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    const b = await open(id);
    a.client.send(claim("a1", "fries"));
    await a.client.next();
    await b.client.next();

    a.client.send(claim("a2", "fries"));
    expect(await a.client.next()).toEqual({ type: "unchanged", ref: "a2", revision: 1 });
    a.client.send(claim("a3", "pitcher"));
    await a.client.next();
    expect(await b.client.next()).toMatchObject({ type: "state", ref: null, split: { revision: 2 } });
  });

  it("delivers a Claim after the Durable Object is evicted and wakes from hibernation", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    const b = await open(id);
    await evictDurableObject(env.SplitServer.getByName(id));

    a.client.send(claim("a1", "pitcher"));
    expect(await a.client.next()).toMatchObject({ type: "state", ref: "a1", split: { revision: 1 } });
    expect(await b.client.next()).toMatchObject({ type: "state", ref: null, split: { revision: 1 } });
  });

  it("gives a client that reconnects the state it missed", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    a.client.send(claim("a1", "fries"));
    await a.client.next();

    const late = await open(id);
    expect(late.hello).toMatchObject({ type: "state", ref: null, split: { revision: 1 } });
  });
});

describe("Payment handles", () => {
  const setHandles = (ref: string, creatorSecret?: string) =>
    JSON.parse(
      JSON.stringify({
        ref,
        op: { type: "setPaymentHandles", by: "ann", handles: [{ service: "cashApp", handle: "$annpays" }] },
        creatorSecret,
      }),
    );

  it("rejects a change without the creator secret and accepts it with the secret", async () => {
    const { id, creatorSecret } = await createSplit();
    const other = await createSplit();
    const a = await open(id);
    const b = await open(id);

    a.client.send(setHandles("h1"));
    expect(await a.client.next()).toEqual({ type: "rejected", ref: "h1", rejection: { reason: "creatorRequired" } });
    a.client.send(setHandles("h2", other.creatorSecret));
    expect(await a.client.next()).toEqual({ type: "rejected", ref: "h2", rejection: { reason: "creatorRequired" } });
    a.client.send(setHandles("h3", "not-a-secret"));
    expect(await a.client.next()).toEqual({ type: "rejected", ref: "h3", rejection: { reason: "creatorRequired" } });

    a.client.send(setHandles("h4", creatorSecret));
    expect(await a.client.next()).toMatchObject({
      type: "state",
      ref: "h4",
      split: { paymentHandles: [{ service: "cashApp", handle: "annpays" }] },
    });
    const broadcast = await b.client.nextRaw();
    expect(JSON.parse(broadcast)).toMatchObject({
      type: "state",
      ref: null,
      split: { revision: 1, paymentHandles: [{ service: "cashApp", handle: "annpays" }] },
    });
    expect(broadcast).not.toContain(creatorSecret);
    expect(JSON.stringify(await storedRow(id))).not.toContain(creatorSecret);
  });

  it("refuses a secret placed inside the Operation instead of the envelope", async () => {
    const { id, creatorSecret } = await createSplit();
    const a = await open(id);
    a.client.send({
      ref: "h1",
      op: JSON.parse(
        JSON.stringify({ type: "setPaymentHandles", by: "ann", handles: [{ service: "venmo", handle: "thief" }], creatorSecret }),
      ),
    });
    expect(await a.client.next()).toEqual({
      type: "rejected",
      ref: "h1",
      rejection: { reason: "malformed", path: "op.creatorSecret" },
    });
  });
});

describe("loading a stored Split", () => {
  const corruptions: [string, (json: string) => string][] = [
    ["JSON that does not parse", (json) => json.slice(0, -1)],
    ["JSON over 32 KB", () => JSON.stringify("x".repeat(33 * 1024))],
    ["a Split under another id", (json) => json.replace(/"id":"[^"]+"/, '"id":"anotherSplit0000000000"')],
  ];

  it.each(corruptions)("refuses %s after a wake, keeps the row, and still expires it", async (_, corrupt) => {
    const { id } = await createSplit();
    const stub = env.SplitServer.getByName(id);
    await runInDurableObject(stub, (_, state) => {
      const [{ json }] = state.storage.sql.exec<{ json: string }>("SELECT json FROM split").toArray();
      state.storage.sql.exec("UPDATE split SET json = ?", corrupt(json));
    });
    await evictDurableObject(stub);
    const before = await storedRow(id);

    const client = await connect(id);
    expect(await client.next()).toEqual({ type: "unavailable", reason: "unreadable" });
    expect(await client.closed).toMatchObject({ code: 4500 });
    expect(await storedRow(id)).toEqual(before);

    vi.setSystemTime(T0 + 60 * DAY);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await leftovers(id)).toEqual({ tables: [], keys: [], alarm: null });
  });

  it("refuses a stored row over 32 KB after a wake without parsing it", async () => {
    const { id } = await createSplit();
    const stub = env.SplitServer.getByName(id);
    const oversized = JSON.stringify({ pad: "x".repeat(33 * 1024) });
    await runInDurableObject(stub, (_, state) => void state.storage.sql.exec("UPDATE split SET json = ?", oversized));
    await evictDurableObject(stub);
    const parse = vi.spyOn(JSON, "parse");

    const client = await connect(id);
    const reply = await client.next();
    const parsedRow = parse.mock.calls.some(([text]) => text === oversized);
    parse.mockRestore();

    expect(reply).toEqual({ type: "unavailable", reason: "unreadable" });
    expect(await client.closed).toMatchObject({ code: 4500 });
    expect(parsedRow).toBe(false);
  });

  it("accepts the creator secret after the Durable Object wakes from storage", async () => {
    const { id, creatorSecret } = await createSplit();
    await evictDurableObject(env.SplitServer.getByName(id));
    const a = await open(id);
    a.client.send({
      ref: "h1",
      creatorSecret,
      op: JSON.parse(JSON.stringify({ type: "setPaymentHandles", by: "ann", handles: [{ service: "zelle", handle: "ann@example.com" }] })),
    });
    expect(await a.client.next()).toMatchObject({
      type: "state",
      ref: "h1",
      split: { paymentHandles: [{ service: "zelle", handle: "ann@example.com" }] },
    });
  });
});

describe("expiry", () => {
  it("deletes a Split when its alarm fires 60 days after the last change", async () => {
    const { id } = await createSplit();
    const stub = env.SplitServer.getByName(id);
    vi.setSystemTime(T0 + 60 * DAY - 1);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await leftovers(id)).alarm).toBe(T0 + 60 * DAY);

    vi.setSystemTime(T0 + 60 * DAY);
    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await leftovers(id)).toEqual({ tables: [], keys: [], alarm: null });
    const late = await connect(id);
    expect(await late.next()).toEqual({ type: "unavailable", reason: "notFound" });
    expect(await late.closed).toMatchObject({ code: 4404 });
  });

  it("reschedules a Split changed since the alarm was set, then deletes it 60 days after that change", async () => {
    const { id } = await createSplit();
    const stub = env.SplitServer.getByName(id);
    vi.setSystemTime(T0 + 10 * DAY);
    const a = await open(id);
    a.client.send(claim("a1", "fries"));
    await a.client.next();
    await evictDurableObject(stub);

    vi.setSystemTime(T0 + 60 * DAY);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await runInDurableObject(stub, (_, state) => state.storage.getAlarm())).toBe(T0 + 70 * DAY);
    const stillThere = await open(id);
    expect(stillThere.hello).toMatchObject({ type: "state", split: { revision: 1 } });

    vi.setSystemTime(T0 + 70 * DAY);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await a.client.next()).toEqual({ type: "unavailable", reason: "notFound" });
    expect(await a.client.closed).toMatchObject({ code: 4404 });
  });

  it("keeps the Split and a retry alarm when deleting it fails", async () => {
    const { id } = await createSplit();
    const stub = env.SplitServer.getByName(id);
    await runInDurableObject(stub, (_, state) => {
      const storage: { deleteAll: () => Promise<void> } = state.storage;
      storage.deleteAll = () => Promise.reject(new Error("storage unavailable"));
    });
    vi.setSystemTime(T0 + 60 * DAY);
    await expect(runDurableObjectAlarm(stub)).rejects.toThrow("storage unavailable");

    expect(await runInDurableObject(stub, (_, state) => state.storage.getAlarm())).toBe(T0 + 61 * DAY);
    expect(await storedRow(id)).toEqual([expect.objectContaining({ changed_at: T0 })]);
  });
});

describe("refusals leave the stored Split unchanged", () => {
  it("refuses a frame over the byte cap before parsing it", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    const before = await storedRow(id);
    const parse = vi.spyOn(JSON, "parse");
    const frames = [
      "{".repeat(41 * 1024),
      `{"ref":"k","op":{"type":"splitUnclaimed","by":null${',"x":0'.repeat(20_000)}}}`,
      JSON.stringify(claim("fits", "fries")),
    ];

    a.client.send(frames[0]);
    a.client.send(frames[1]);
    const refusals = [await a.client.nextRaw(), await a.client.nextRaw()];
    expect(await storedRow(id)).toEqual(before);
    a.client.send(frames[2]);
    const accepted = await a.client.nextRaw();
    const parsedFrames = parse.mock.calls.map(([text]) => text).filter((text) => frames.includes(text));
    parse.mockRestore();

    expect(new Set(parsedFrames)).toEqual(new Set([frames[2]]));
    const tooLarge = { type: "rejected", ref: null, rejection: { reason: "messageTooLarge" } };
    expect(refusals.map((reply) => JSON.parse(reply))).toEqual([tooLarge, tooLarge]);
    expect(JSON.parse(accepted)).toMatchObject({ type: "state", ref: "fits", split: { revision: 1 } });
  });

  it("refuses an Operation that would push the Split over 32 KB and keeps the stored state", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    const longName = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}".repeat(20);
    let accepted: Split | null = null;
    let rejection: unknown = null;
    let refusedItem = "";
    for (let index = 0; rejection === null; index += 1) {
      refusedItem = `extra${index}`;
      a.client.send({
        ref: `add${index}`,
        op: JSON.parse(
          JSON.stringify({
            type: "editReceipt",
            by: null,
            items: [{ type: "add", item: { id: `extra${index}`, name: longName, price: 0 }, index: 0 }],
          }),
        ),
      });
      const reply = await a.client.next();
      if (reply.type === "state") accepted = reply.split;
      else if (reply.type === "rejected") rejection = reply.rejection;
    }
    expect(rejection).toEqual({ reason: "tooLarge" });
    expect(accepted?.receipt.items.map(({ id: itemId }) => itemId)).toContain("extra0");
    expect(accepted?.receipt.items.map(({ id: itemId }) => itemId)).not.toContain(refusedItem);
    const [row] = await runInDurableObject(env.SplitServer.getByName(id), (_, state) =>
      state.storage.sql.exec<{ json: string }>("SELECT json FROM split").toArray(),
    );
    expect(JSON.parse(row.json)).toEqual(accepted);

    await evictDurableObject(env.SplitServer.getByName(id));
    const late = await open(id);
    expect(late.hello).toEqual({ type: "state", ref: null, split: accepted });
  });

  it("answers bad JSON and a bad envelope with malformed and keeps serving", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    a.client.send("not json");
    expect(await a.client.next()).toEqual({ type: "rejected", ref: null, rejection: { reason: "malformed", path: "" } });
    a.client.send(JSON.stringify({ ref: "e1", op: { type: "claim" } }));
    expect(await a.client.next()).toMatchObject({ type: "rejected", ref: "e1", rejection: { reason: "malformed" } });
    a.client.send(JSON.stringify({ ref: "e2", op: { type: "splitUnclaimed", by: null }, extra: 1 }));
    expect(await a.client.next()).toEqual({ type: "rejected", ref: "e2", rejection: { reason: "malformed", path: "extra" } });
    a.client.send(claim("ok", "fries"));
    expect(await a.client.next()).toMatchObject({ type: "state", ref: "ok", split: { revision: 1 } });
  });

  it("refuses a creator secret that is not a string and a ref outside the pattern", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    const op = { type: "splitUnclaimed", by: null };
    a.client.send(JSON.stringify({ ref: "n", creatorSecret: 5, op }));
    expect(await a.client.next()).toEqual({ type: "rejected", ref: "n", rejection: { reason: "malformed", path: "creatorSecret" } });
    for (const ref of ["has space", "x".repeat(65), ""]) {
      a.client.send(JSON.stringify({ ref, op }));
      expect(await a.client.next()).toEqual({ type: "rejected", ref: null, rejection: { reason: "malformed", path: "ref" } });
    }
    a.client.send(JSON.stringify({ ref: "x".repeat(64), op }));
    expect(await a.client.next()).toMatchObject({ type: "state", ref: "x".repeat(64), split: { revision: 1 } });
  });

  it("rate limits a burst of operations on one Split", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    for (let index = 0; index < 61; index += 1) {
      a.client.send(claim(`c${index}`, index % 2 === 0 ? "fries" : "pitcher", "ann"));
    }
    const replies: ServerMessage[] = [];
    for (let index = 0; index < 61; index += 1) replies.push(await a.client.next());
    expect(replies.filter(({ type }) => type === "state")).toHaveLength(2);
    expect(replies.filter(({ type }) => type === "unchanged")).toHaveLength(58);
    expect(replies[60]).toEqual({ type: "rejected", ref: null, rejection: { reason: "rateLimited", retryAfterMs: 50 } });
  });

  it("refills the bucket at 20 operations a second", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    const burst = async (count: number) => {
      for (let index = 0; index < count; index += 1) a.client.send(claim(`r${index}`, "fries"));
      const kinds: string[] = [];
      for (let index = 0; index < count; index += 1) kinds.push((await a.client.next()).type);
      return kinds.filter((kind) => kind !== "rejected").length;
    };
    expect(await burst(61)).toBe(60);
    vi.setSystemTime(T0 + 50);
    expect(await burst(2)).toBe(1);
    vi.setSystemTime(T0 + 1050);
    expect(await burst(21)).toBe(20);
  });

  it("closes a socket after 100 rate-limited frames in a row and keeps serving others", async () => {
    const { id } = await createSplit();
    const flooder = await open(id);
    const neighbour = await open(id);
    for (let index = 0; index < 160; index += 1) flooder.client.send(claim(`f${index}`, "fries"));
    const limited: ServerMessage[] = [];
    for (let index = 0; index < 160; index += 1) {
      const reply = await flooder.client.next();
      if (reply.type === "rejected") limited.push(reply);
    }
    expect(limited).toHaveLength(100);
    expect(await flooder.client.closed).toMatchObject({ code: 1008 });

    vi.setSystemTime(T0 + 1000);
    await neighbour.client.next();
    neighbour.client.send(claim("n1", "pitcher"));
    expect(await neighbour.client.next()).toMatchObject({ type: "state", ref: "n1" });
  });
});

describe("connecting", () => {
  it("ends a connection to a Split that does not exist and leaves no storage behind", async () => {
    const id = "nosuchsplit0000000000A";
    const client = await connect(id);
    expect(await client.next()).toEqual({ type: "unavailable", reason: "notFound" });
    expect(await client.closed).toMatchObject({ code: 4404 });
    expect(await leftovers(id)).toEqual({ tables: [], keys: [], alarm: null });
  });

  it("answers the heartbeat without the Split", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    a.client.send("ping");
    expect(await a.client.nextRaw()).toBe("pong");
  });

});

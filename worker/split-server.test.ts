import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientMessage, ServerMessage } from "../src/core/operations";
import { connect, createSplit, stubSiteverify, type Client } from "./testing";

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

async function leftovers(id: string): Promise<{ tables: unknown[]; keys: string[]; alarm: number | null }> {
  return runInDurableObject(env.SplitServer.getByName(id), async (_, state) => ({
    tables: state.storage.sql
      .exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'")
      .toArray(),
    keys: [...(await state.storage.list()).keys()],
    alarm: await state.storage.getAlarm(),
  }));
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
    let revision = 0;
    let rejection: unknown = null;
    for (let index = 0; rejection === null; index += 1) {
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
      if (reply.type === "state") revision = reply.split.revision;
      else if (reply.type === "rejected") rejection = reply.rejection;
    }
    expect(rejection).toEqual({ reason: "tooLarge" });
    const before = await storedRow(id);

    const late = await open(id);
    expect(late.hello).toMatchObject({ type: "state", split: { revision } });
    expect(await storedRow(id)).toEqual(before);
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

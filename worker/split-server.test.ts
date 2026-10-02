import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientMessage, ServerMessage } from "../src/core/operations";
import type { Split } from "../src/core/split";
import { connect, createSplit, leftovers, stubSiteverify, T0, type Client } from "./testing";

const DAY = 24 * 60 * 60 * 1000;

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
    expect(toOther.split.receipt.items.map(({ id: itemId, split }) => [itemId, split.units[0]])).toEqual([
      ["fries", ["ann"]],
      ["pitcher", []],
    ]);

    b.client.send(claim("b1", "pitcher"));
    expect(await b.client.next()).toMatchObject({ type: "state", ref: "b1", split: { revision: 2 } });
    const seenByA = await a.client.next();
    if (seenByA.type !== "state") throw new Error("expected state");
    expect(seenByA.split.receipt.items.map(({ split }) => split.units[0])).toEqual([["ann"], ["ann"]]);
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

describe("picks, edits, and Undo between clients", () => {
  const op = (ref: string, operation: object): ClientMessage => JSON.parse(JSON.stringify({ ref, op: operation }));

  async function stateFrom(client: Client): Promise<Split> {
    const message = await client.next();
    if (message.type !== "state") throw new Error(`expected state, got ${JSON.stringify(message)}`);
    return message.split;
  }

  it("a second device's pick of a taken name is refused, That's me moves it, and a price fix reaches every client, survives a wake, and a third client's Undo reverses it", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    const b = await open(id);
    a.client.send(op("a1", { type: "addParticipant", by: "bob", participant: { id: "bob", name: "Bob" } }));
    a.client.send(op("a2", { type: "pick", by: "bob", participantId: "bob", device: "phone-a", takeOver: false }));
    for (let n = 0; n < 2; n += 1) await stateFrom(a.client);
    for (let n = 0; n < 2; n += 1) await stateFrom(b.client);
    b.client.send(op("b1", { type: "pick", by: "bob", participantId: "bob", device: "phone-b", takeOver: false }));
    expect(await b.client.next()).toEqual({ type: "rejected", ref: "b1", rejection: { reason: "namePicked" } });

    b.client.send(op("b2", { type: "pick", by: "bob", participantId: "bob", device: "phone-b", takeOver: true }));
    b.client.send(
      op("b3", { type: "editReceipt", by: null, items: [{ type: "edit", itemId: "fries", price: 600 }], subtotalDelta: -200, totalDelta: -200 }),
    );
    await stateFrom(a.client);
    const seenByA = await stateFrom(a.client);
    expect(await stateFrom(b.client)).toMatchObject({ picks: [{ participantId: "bob", device: "phone-b" }] });
    expect(await stateFrom(b.client)).toEqual(seenByA);
    expect([seenByA.picks, seenByA.receipt.items[0].price, seenByA.recentChanges.map(({ revision, writes }) => [revision, writes[0].kind])]).toEqual([
      [{ participantId: "bob", device: "phone-b" }],
      600,
      [
        [1, "participant"],
        [4, "item"],
      ],
    ]);

    await evictDurableObject(env.SplitServer.getByName(id));
    const c = await open(id);
    expect(c.hello).toMatchObject({ type: "state", split: { revision: 4, picks: [{ participantId: "bob", device: "phone-b" }] } });
    c.client.send(op("c1", { type: "undo", by: null, revision: 4 }));
    const final = await stateFrom(c.client);

    expect([final.receipt.items[0].price, final.receipt.total]).toEqual([800, 4137]);
    for (const client of [a.client, b.client]) expect(await stateFrom(client)).toEqual(final);
  });

  it("only the device that picked a name records its Payment, and the other client sees it land", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    const b = await open(id);
    a.client.send(op("a1", { type: "addParticipant", by: "bob", participant: { id: "bob", name: "Bob" } }));
    a.client.send(op("a2", { type: "pick", by: "bob", participantId: "bob", device: "phone-a", takeOver: false }));
    for (let n = 0; n < 2; n += 1) await stateFrom(a.client);
    for (let n = 0; n < 2; n += 1) await stateFrom(b.client);

    b.client.send(op("b1", { type: "recordPayment", by: "bob", participantId: "bob", device: "phone-b", amount: 2200 }));
    expect(await b.client.next()).toEqual({ type: "rejected", ref: "b1", rejection: { reason: "payerOnly" } });

    a.client.send(op("a3", { type: "recordPayment", by: "bob", participantId: "bob", device: "phone-a", amount: 2200 }));
    expect((await stateFrom(b.client)).payments).toEqual([{ participantId: "bob", amount: 2200 }]);
  });
});

describe("a flood of recorded changes", () => {
  const op = (ref: string, operation: object): ClientMessage => JSON.parse(JSON.stringify({ ref, op: operation }));

  it("is rate limited by bytes before it pushes a price change out of the recent changes, so Undo still reaches it, and restoreReceipt puts the price back", async () => {
    const { id } = await createSplit();
    const victim = await open(id);
    const vandal = await open(id);
    victim.client.send(
      op("v1", { type: "editReceipt", by: null, items: [{ type: "edit", itemId: "fries", price: 1 }], subtotalDelta: -799, totalDelta: -799 }),
    );
    await victim.client.next();
    await vandal.client.next();

    for (let index = 0; index < 100; index += 1) {
      vandal.client.send(op(`f${index}`, { type: "editReceipt", by: null, items: [{ type: "edit", itemId: "pitcher", name: `Pitcher ${index}` }] }));
    }
    const replies: ServerMessage[] = [];
    for (let index = 0; index < 100; index += 1) replies.push(await vandal.client.next());
    const landed = replies.filter((reply) => reply.type === "state");
    const byBytes = replies.filter((reply) => reply.type === "rejected" && reply.ref !== null);
    const last = landed.at(-1);
    if (last?.type !== "state") throw new Error("expected a state");

    expect([landed.length, byBytes.length, replies.length - landed.length - byBytes.length]).toEqual([30, 29, 41]);
    expect(byBytes[0]).toEqual({ type: "rejected", ref: "f30", rejection: { reason: "rateLimited", retryAfterMs: 4 } });
    expect(last.split.recentChanges[0]).toMatchObject({
      revision: 1,
      writes: [
        { kind: "item", id: "fries", edit: { price: [800, 1] } },
        { kind: "totals", subtotalDelta: -799, totalDelta: -799 },
      ],
    });

    vi.setSystemTime(T0 + 10_000);
    victim.client.send(op("v2", { type: "undo", by: null, revision: 1 }));
    victim.client.send(op("v3", { type: "undo", by: null, revision: last.split.revision + 1 }));
    victim.client.send(op("v4", { type: "restoreReceipt", by: null }));
    const answers: ServerMessage[] = [];
    for (let index = 0; index < 33; index += 1) answers.push(await victim.client.next());
    const mine = answers.filter((answer) => answer.type !== "state" || answer.ref !== null);

    expect(mine.map((answer) => (answer.type === "state" ? [answer.ref, answer.split.receipt.items.map(({ name, price }) => [name, price])] : answer))).toEqual([
      ["v2", [["Fries", 800], ["Pitcher 29", 3000]]],
      ["v3", [["Fries", 1], ["Pitcher 29", 3000]]],
      ["v4", [["Fries", 800], ["Pitcher", 3000]]],
    ]);
  });
});

describe("history rate after an eviction", () => {
  it("still refuses a recorded change by bytes after the Split is evicted", async () => {
    const { id } = await createSplit();
    const vandal = await open(id);
    const rename = (ref: string, name: string): ClientMessage =>
      JSON.parse(JSON.stringify({ ref, op: { type: "editReceipt", by: null, items: [{ type: "edit", itemId: "pitcher", name }] } }));
    for (let index = 0; index < 40; index += 1) vandal.client.send(rename(`f${index}`, `Pitcher ${index}`));
    const replies: ServerMessage[] = [];
    for (let index = 0; index < 40; index += 1) replies.push(await vandal.client.next());
    expect(replies.at(-1)).toMatchObject({ type: "rejected", ref: "f39", rejection: { reason: "rateLimited" } });

    await evictDurableObject(env.SplitServer.getByName(id));
    const after = await open(id);
    after.client.send(rename("again", "Pitcher again"));
    expect(await after.client.next()).toMatchObject({ type: "rejected", ref: "again", rejection: { reason: "rateLimited" } });
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

  it("keeps a retry alarm when deleteAll fails twice on a warm instance, then expires after a wake", async () => {
    const { id } = await createSplit();
    const stub = env.SplitServer.getByName(id);
    await runInDurableObject(stub, (_, state) => {
      const storage: { deleteAll: () => Promise<void> } = state.storage;
      storage.deleteAll = () => Promise.reject(new Error("storage unavailable"));
    });
    vi.setSystemTime(T0 + 60 * DAY);
    await expect(runDurableObjectAlarm(stub)).rejects.toThrow("storage unavailable");
    vi.setSystemTime(T0 + 61 * DAY);
    await expect(runDurableObjectAlarm(stub)).rejects.toThrow("storage unavailable");
    expect(await runInDurableObject(stub, (_, state) => state.storage.getAlarm())).toBe(T0 + 62 * DAY);

    await evictDurableObject(stub);
    vi.setSystemTime(T0 + 62 * DAY);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await leftovers(id)).toEqual({ tables: [], keys: [], alarm: null });
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
      `{"ref":"k","op":{"type":"restoreReceipt","by":null${',"x":0'.repeat(20_000)}}}`,
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
      vi.setSystemTime(T0 + index * 10_000);
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
    a.client.send(JSON.stringify({ ref: "e2", op: { type: "restoreReceipt", by: null }, extra: 1 }));
    expect(await a.client.next()).toEqual({ type: "rejected", ref: "e2", rejection: { reason: "malformed", path: "extra" } });
    a.client.send(claim("ok", "fries"));
    expect(await a.client.next()).toMatchObject({ type: "state", ref: "ok", split: { revision: 1 } });
  });

  it("refuses an added Item of 10,000,000 units within 250 ms and keeps serving", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    const started = performance.now();
    a.client.send({ ref: "q1", op: { type: "editReceipt", by: null, items: [{ type: "add", item: { id: "pie", name: "Pie", price: 100, quantity: 10_000_000 }, index: 0 }] } } as never);
    expect(await a.client.next()).toEqual({ type: "rejected", ref: "q1", rejection: { reason: "malformed", path: "op.items[0].item.quantity" } });
    expect(performance.now() - started).toBeLessThan(250);
    a.client.send(claim("ok", "fries"));
    expect(await a.client.next()).toMatchObject({ type: "state", ref: "ok", split: { revision: 1 } });
  });

  it("refuses a creator secret that is not a string and a ref outside the pattern", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    const op = { type: "claim", by: "ann", itemId: "fries", participantId: "ann" };
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

  it("keeps an exhausted operation bucket across an eviction", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    for (let index = 0; index < 59; index += 1) a.client.send(claim(`c${index}`, "fries"));
    a.client.send(claim("c59", "pitcher"));
    const kinds: string[] = [];
    for (let index = 0; index < 60; index += 1) kinds.push((await a.client.next()).type);
    expect(kinds.filter((kind) => kind === "rejected")).toEqual([]);

    await evictDurableObject(env.SplitServer.getByName(id));
    const b = await open(id);
    b.client.send(claim("after", "fries", "ann"));
    expect(await b.client.next()).toEqual({ type: "rejected", ref: null, rejection: { reason: "rateLimited", retryAfterMs: 50 } });
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
});

describe("closing flooding sockets", () => {
  const toggle = (ref: string, claimed: boolean): ClientMessage =>
    JSON.parse(JSON.stringify({ ref, op: { type: claimed ? "claim" : "unclaim", by: "ann", itemId: "fries", participantId: "ann" } }));

  it("keeps a socket open past 100 early frames in total when admitted frames split them", async () => {
    const { id } = await createSplit();
    const a = await open(id);
    let limited = 0;
    for (let round = 0; round < 3; round += 1) {
      vi.setSystemTime(T0 + round * 1000);
      for (let index = 0; index < 80; index += 1) a.client.send(claim(`q${round}-${index}`, "fries"));
      for (let index = 0; index < 80; index += 1) {
        const reply = await a.client.next();
        if (reply.type === "rejected" && reply.rejection.reason === "rateLimited") limited += 1;
      }
    }
    expect(limited).toBe(140);
    a.client.send("ping");
    expect(await a.client.nextRaw()).toBe("pong");
  });

  it("closes a flooder with 1008 and never closes a client beside it that waits retryAfterMs", async () => {
    const { id } = await createSplit();
    const taker = await open(id);
    const honest = await open(id);
    const flooder = await open(id);
    for (let index = 0; index < 60; index += 1) taker.client.send(claim(`t${index}`, "fries"));
    for (let index = 0; index < 60; index += 1) await taker.client.next();
    await honest.client.next();
    await flooder.client.next();

    let now = T0;
    let flooderRefusals = 0;
    for (let round = 0; round < 150; round += 1) {
      honest.client.send(claim(`h${round}`, "fries"));
      const reply = await honest.client.next();
      if (reply.type !== "rejected" || reply.rejection.reason !== "rateLimited") throw new Error(JSON.stringify(reply));
      if (round < 25) {
        for (let index = 0; index < 5; index += 1) flooder.client.send(claim(`f${round}-${index}`, "fries"));
        for (let index = 0; index < 5; index += 1) if ((await flooder.client.next()).type === "rejected") flooderRefusals += 1;
      }
      now += reply.rejection.retryAfterMs;
      vi.setSystemTime(now);
      taker.client.send(claim(`x${round}`, "fries"));
      expect(await taker.client.next()).toMatchObject({ type: "unchanged" });
    }

    expect(flooderRefusals).toBe(125);
    expect(await flooder.client.closed).toEqual({ code: 1008, reason: "rateLimited" });
    honest.client.send("ping");
    expect(await honest.client.nextRaw()).toBe("pong");
  });

  it("closes a socket after 100 frames sent before its retryAfterMs and keeps serving others", async () => {
    const { id } = await createSplit();
    const flooder = await open(id);
    const neighbour = await open(id);
    for (let index = 0; index < 161; index += 1) flooder.client.send(claim(`f${index}`, "fries"));
    const limited: ServerMessage[] = [];
    for (let index = 0; index < 161; index += 1) {
      const reply = await flooder.client.next();
      if (reply.type === "rejected") limited.push(reply);
    }
    expect(limited).toHaveLength(101);
    expect(await flooder.client.closed).toEqual({ code: 1008, reason: "rateLimited" });

    vi.setSystemTime(T0 + 1000);
    await neighbour.client.next();
    neighbour.client.send(claim("n1", "pitcher"));
    expect(await neighbour.client.next()).toMatchObject({ type: "state", ref: "n1" });
  });

  it("ignores frames that arrive after the flood close and logs no errors", async () => {
    const errors = vi.spyOn(console, "error");
    const { id } = await createSplit();
    const flooder = await open(id);
    const neighbour = await open(id);
    for (let index = 0; index < 400; index += 1) flooder.client.send(toggle(`f${index}`, index % 2 === 0));
    const replies: ServerMessage[] = [];
    for (let index = 0; index < 161; index += 1) replies.push(await flooder.client.next());
    expect(await flooder.client.closed).toMatchObject({ code: 1008 });

    vi.setSystemTime(T0 + 60_000);
    neighbour.client.send(claim("n1", "pitcher"));
    const revisions: number[] = [];
    for (let done = false; !done; ) {
      const reply = await neighbour.client.next();
      if (reply.type !== "state") throw new Error(JSON.stringify(reply));
      revisions.push(reply.split.revision);
      done = reply.ref === "n1";
    }
    const errorLines = errors.mock.calls.length;
    errors.mockRestore();

    expect(replies.filter(({ type }) => type === "rejected")).toHaveLength(101);
    expect(revisions).toEqual(Array.from({ length: 61 }, (_, index) => index + 1));
    expect(errorLines).toBe(0);
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

import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { parseCreateSplitRequest } from "../src/core/parse";
import { isRoutableSplitId, LEGACY_SPLIT_ID_LENGTH, randomId } from "../src/core/split";
import { DAILY_CAP_NAME, DAILY_CREATE_CAP } from "./rate-limit";
import { billedRowWrites, newSplit, postSplit, T0 } from "./testing";

const DAY = 24 * 60 * 60 * 1000;

const measuredRowWrites = { limiter: 3, cap: 1, server: 15 };

it("one create with a photo writes 19 rows from its POST through its photo upload and the one replace it allows, its first connect, the photo's delete, and its expiry, as DAILY_CREATE_CAP assumes", async () => {
  vi.setSystemTime(T0 - 30 * DAY);
  const ip = "192.0.2.200";
  const limiter = env.CreateLimiter.getByName(ip);
  const cap = env.CreateLimiter.getByName(DAILY_CAP_NAME);
  const limiterWrites = await runInDurableObject(limiter, (_, state) => billedRowWrites(state.storage));
  expect((await postSplit({ split: newSplit })).status).toBe(201);
  const capWrites = await runInDurableObject(cap, (_, state) => billedRowWrites(state.storage));
  expect((await postSplit({ split: newSplit }, { ip })).status).toBe(201);
  vi.setSystemTime(T0 - 30 * DAY + DAY / 2);
  await runDurableObjectAlarm(limiter);

  const id = randomId(LEGACY_SPLIT_ID_LENGTH);
  const parsed = isRoutableSplitId(id) ? parseCreateSplitRequest({ split: newSplit }, id) : null;
  if (!parsed?.ok) throw new Error(`could not build a Split for ${id}`);
  const server = env.SplitServer.getByName(id);
  const { writes: serverWrites, created } = await runInDurableObject(server, async (instance, state) => {
    const writes = billedRowWrites(state.storage);
    const created = await instance.create(parsed.split);
    if (!created.created) throw new Error(`Split ${id} already exists`);
    return { writes, created };
  });
  for (const fill of [0x11, 0x22]) {
    const upload = await exports.default.fetch(`http://localhost/api/splits/${id}/photo`, {
      method: "PUT",
      headers: { "content-type": "image/jpeg", authorization: `Bearer ${created.creatorSecret}` },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, fill, 0xff, 0xd9]),
    });
    expect(upload.status).toBe(204);
  }
  const socket = (await exports.default.fetch(`http://localhost/parties/split-server/${id}`, { headers: { upgrade: "websocket" } })).webSocket;
  socket?.accept();
  socket?.close();
  vi.setSystemTime(T0 - 16 * DAY + 60_000);
  await runDurableObjectAlarm(server);
  vi.setSystemTime(T0 + 31 * DAY);
  await runDurableObjectAlarm(server);

  expect({ limiter: limiterWrites(), cap: capWrites(), server: serverWrites() }).toEqual(measuredRowWrites);
});

it("DAILY_CREATE_CAP is the floor of a quarter of the free plan's 100,000 daily row writes over the budgeted writes per create, which adds 3 for each of the split and photo tables dropped at expiry, which no test sees", () => {
  const tablesDroppedAtExpiry = ["split", "photo"];
  const budgetedWritesPerCreate = Object.values(measuredRowWrites).reduce((sum, writes) => sum + writes, 0) + 3 * tablesDroppedAtExpiry.length;
  expect(budgetedWritesPerCreate).toBe(25);
  expect(DAILY_CREATE_CAP).toBe(Math.floor(100_000 / 4 / budgetedWritesPerCreate));
});

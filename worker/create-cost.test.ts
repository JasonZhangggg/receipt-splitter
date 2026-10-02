import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { parseCreateSplitRequest } from "../src/core/parse";
import { isRoutableSplitId, randomId, SPLIT_ID_LENGTH } from "../src/core/split";
import { DAILY_CAP_NAME } from "./rate-limit";
import { newSplit, postSplit, T0 } from "./testing";

type Meter = () => number;

/** Counts row writes the way Cloudflare bills them: SQL rows written, one per put key, one per setAlarm, and one per row deleteAll removes. */
function meter(storage: DurableObjectStorage): Meter {
  const counts: Meter[] = [];
  const { sql } = storage;
  const exec = sql.exec.bind(sql);
  sql.exec = ((query: string, ...bindings: unknown[]) => {
    const cursor = exec(query, ...bindings);
    counts.push(() => cursor.rowsWritten);
    return cursor;
  }) as typeof sql.exec;
  const put = storage.put.bind(storage) as (key: string, value: unknown) => Promise<void>;
  storage.put = (async (key: string, value: unknown) => {
    counts.push(() => 1);
    await put(key, value);
  }) as typeof storage.put;
  const setAlarm = storage.setAlarm.bind(storage);
  storage.setAlarm = async (time) => {
    counts.push(() => 1);
    await setAlarm(time);
  };
  const deleteAll = storage.deleteAll.bind(storage);
  storage.deleteAll = async () => {
    const tables = exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'").toArray();
    const rows = tables.reduce((sum, { name }) => sum + Number(exec(`SELECT count(*) AS n FROM "${String(name)}"`).one().n), 0);
    const keys = (await storage.list()).size;
    counts.push(() => rows + keys);
    await deleteAll();
  };
  return () => counts.reduce((sum, count) => sum + count(), 0);
}

it("one create writes 12 rows from its POST through its first connect to its expiry, as DAILY_CREATE_CAP assumes", async () => {
  vi.setSystemTime(T0 - 30 * 24 * 60 * 60 * 1000);
  const ip = "192.0.2.200";
  const limiter = env.CreateLimiter.getByName(ip);
  const cap = env.CreateLimiter.getByName(DAILY_CAP_NAME);
  const limiterWrites = await runInDurableObject(limiter, (_, state) => meter(state.storage));
  expect((await postSplit({ split: newSplit })).status).toBe(201);
  const capWrites = await runInDurableObject(cap, (_, state) => meter(state.storage));
  expect((await postSplit({ split: newSplit }, { ip })).status).toBe(201);
  vi.setSystemTime(T0 - 30 * 24 * 60 * 60 * 1000 + 60_000);
  await runDurableObjectAlarm(limiter);

  const id = randomId(SPLIT_ID_LENGTH);
  const parsed = isRoutableSplitId(id) ? parseCreateSplitRequest({ split: newSplit }, id) : null;
  if (!parsed?.ok) throw new Error(`could not build a Split for ${id}`);
  const server = env.SplitServer.getByName(id);
  const serverWrites = await runInDurableObject(server, async (instance, state) => {
    const writes = meter(state.storage);
    await instance.create(parsed.split);
    return writes;
  });
  const socket = (await exports.default.fetch(`http://localhost/parties/split-server/${id}`, { headers: { upgrade: "websocket" } })).webSocket;
  socket?.accept();
  socket?.close();
  vi.setSystemTime(T0 + 31 * 24 * 60 * 60 * 1000);
  await runDurableObjectAlarm(server);

  expect({ limiter: limiterWrites(), cap: capWrites(), server: serverWrites() }).toEqual({ limiter: 3, cap: 1, server: 8 });
});

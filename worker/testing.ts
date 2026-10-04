import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import type { ClientMessage, CreateSplitRequest, CreateSplitResponse, ServerMessage } from "../src/core/operations";

export const newSplit: CreateSplitRequest["split"] = JSON.parse(
  JSON.stringify({
    receipt: {
      items: [
        { id: "fries", name: "Fries", price: 800 },
        { id: "pitcher", name: "Pitcher", price: 3000 },
      ],
      adjustments: [{ id: "tax", kind: "tax", name: "Tax", amount: 337 }],
      subtotal: 3800,
      total: 4137,
    },
    participants: [{ id: "ann", name: "Ann" }],
    paymentHandles: [{ service: "venmo", handle: "ann-host" }],
  }),
);

let nextAddress = 1;

export function postSplit(body: unknown, { ip = `198.51.100.${nextAddress++}` } = {}): Promise<Response> {
  return exports.default.fetch("http://localhost/api/splits", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export async function createSplit(split: unknown = newSplit): Promise<CreateSplitResponse> {
  const response = await postSplit({ split });
  if (response.status !== 201) throw new Error(`create returned ${response.status}: ${await response.text()}`);
  return response.json();
}

export type Client = {
  send(message: ClientMessage | string): void;
  next(): Promise<ServerMessage>;
  nextRaw(): Promise<string>;
  closed: Promise<{ code: number; reason: string }>;
};

export async function connect(id: string): Promise<Client> {
  const response = await exports.default.fetch(`http://localhost/parties/split-server/${id}`, {
    headers: { upgrade: "websocket" },
  });
  const socket = response.webSocket;
  if (!socket) throw new Error(`upgrade to ${id} returned ${response.status}`);
  const inbox: string[] = [];
  const waiting: ((message: string) => void)[] = [];
  socket.addEventListener("message", ({ data }) => {
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    const waiter = waiting.shift();
    if (waiter) waiter(text);
    else inbox.push(text);
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    socket.addEventListener("close", ({ code, reason }) => resolve({ code, reason })),
  );
  socket.accept();
  const nextRaw = () => {
    const queued = inbox.shift();
    return queued !== undefined ? Promise.resolve(queued) : new Promise<string>((resolve) => waiting.push(resolve));
  };
  return {
    send: (message) => socket.send(typeof message === "string" ? message : JSON.stringify(message)),
    nextRaw,
    next: async () => JSON.parse(await nextRaw()),
    closed,
  };
}

export async function leftovers(id: string): Promise<{ tables: unknown[]; keys: string[]; alarm: number | null }> {
  return runInDurableObject(env.SplitServer.getByName(id), async (_, state) => ({
    tables: state.storage.sql
      .exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'")
      .toArray(),
    keys: [...(await state.storage.list()).keys()],
    alarm: await state.storage.getAlarm(),
  }));
}

type Meter = () => number;

/** Counts the rows a Durable Object writes from now on, as billing counts them: SQL rowsWritten, one per key put, one per alarm set, and every row deleteAll drops. */
export function billedRowWrites(storage: DurableObjectStorage): Meter {
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

/** Runs `run` and returns the rows the Split Durable Object named `id` wrote meanwhile. */
export async function rowsWrittenBy(id: string, run: () => Promise<unknown>): Promise<number> {
  const meter = await runInDurableObject(env.SplitServer.getByName(id), (_, state) => billedRowWrites(state.storage));
  await run();
  return meter();
}

export type Probed ={ readonly status: number; readonly first?: ServerMessage; readonly closed?: { code: number; reason: string } };

/** Opens the Split socket and waits for the server to end it. */
export async function probe(id: string, fetcher: (request: Request) => Promise<Response> = (request) => exports.default.fetch(request)): Promise<Probed> {
  const response = await fetcher(new Request(`http://localhost/parties/split-server/${id}`, { headers: { upgrade: "websocket" } }));
  const socket = response.webSocket;
  if (!socket) return { status: response.status };
  const first = new Promise<ServerMessage>((resolve) => socket.addEventListener("message", ({ data }) => resolve(JSON.parse(String(data)))));
  const closed = new Promise<{ code: number; reason: string }>((resolve) => socket.addEventListener("close", ({ code, reason }) => resolve({ code, reason })));
  socket.accept();
  return { status: response.status, first: await first, closed: await closed };
}

/** Durable Object alarms run on the real clock, so a fake now in the past would fire every 60-day expiry alarm mid-test. */
export const T0 = Date.parse("2100-01-01T12:00:00Z");

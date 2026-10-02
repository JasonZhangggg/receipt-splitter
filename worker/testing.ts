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

/** Durable Object alarms run on the real clock, so a fake now in the past would fire every 60-day expiry alarm mid-test. */
export const T0 = Date.parse("2100-01-01T12:00:00Z");

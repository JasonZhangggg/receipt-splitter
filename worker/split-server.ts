import { Server, type Connection } from "partyserver";
import { MAX_STORED_BYTES, applyOperation, type ClientMessage, type ServerMessage, type WireRejection } from "../src/core/operations";
import { parseClientMessage, parseSplit } from "../src/core/parse";
import { serializedBytes, type Split } from "../src/core/split";
import { HISTORY_LIMIT, OPERATION_LIMIT, takeToken, type Bucket } from "./rate-limit";

const MAX_MESSAGE_BYTES = 40 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const SPLIT_TTL_MS = 60 * DAY_MS;
const PHOTO_TTL_MS = 14 * DAY_MS;
const PHOTO_PUT_LIMIT = 2;
const EXPIRY_RETRY_MS = DAY_MS;
const MAX_EARLY_FRAMES = 100;
const HEARTBEAT = { ping: "ping", pong: "pong" } as const;

const SECRET_BYTES = 32;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type Stored =
  | { readonly kind: "missing" }
  | { readonly kind: "unreadable"; readonly changedAt: number }
  | {
      readonly kind: "live";
      readonly split: Split;
      readonly json: string;
      readonly changedAt: number;
      readonly secret: Uint8Array;
      readonly rate: Rate;
      readonly photo: Photo;
    };

type Photo =
  | { readonly kind: "beforePhotos" }
  | { readonly kind: "empty"; readonly until: number }
  | { readonly kind: "held"; readonly until: number; readonly puts: number };

type Rate = { readonly operations: Bucket | null; readonly history: Bucket | null };

type Frame =
  | ({ readonly ok: true } & ClientMessage)
  | { readonly ok: false; readonly ref: string | null; readonly rejection: WireRejection };

type Pacing = { readonly retryAt: number; readonly early: number };

type Row = {
  json: string;
  changed_at: number;
  created_at?: number | null;
  creator_secret: ArrayBuffer;
  bytes: number;
  operations_tokens: number | null;
  operations_at: number | null;
  history_tokens: number | null;
  history_at: number | null;
};

export class SplitServer extends Server<Cloudflare.Env> {
  static options = { hibernate: true };

  #stored: Stored = { kind: "missing" };
  #pacing = new WeakMap<Connection, Pacing>();

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT.ping, HEARTBEAT.pong));
  }

  async create(split: Split): Promise<{ readonly created: true; readonly creatorSecret: string } | { readonly created: false }> {
    if (split.id !== this.name) throw new Error(`SplitServer ${this.name} cannot hold Split ${split.id}`);
    const sql = this.ctx.storage.sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS split (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), json TEXT NOT NULL, changed_at INTEGER NOT NULL, created_at INTEGER, creator_secret BLOB NOT NULL, operations_tokens REAL, operations_at INTEGER, history_tokens REAL, history_at INTEGER)",
    );
    if (sql.exec("SELECT 1 FROM split").toArray().length > 0) return { created: false };
    const secret = crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
    const json = JSON.stringify(split);
    const now = Date.now();
    sql.exec("INSERT INTO split (singleton, json, changed_at, created_at, creator_secret) VALUES (1, ?, ?, ?, ?)", json, now, now, secret);
    this.#stored = {
      kind: "live",
      split,
      json,
      changedAt: now,
      secret,
      rate: { operations: null, history: null },
      photo: { kind: "empty", until: now + PHOTO_TTL_MS },
    };
    await this.ctx.storage.setAlarm(now + SPLIT_TTL_MS);
    return { created: true, creatorSecret: toBase64Url(secret) };
  }

  /** partyserver writes a name row on its first fetch, so a probe to an id no Split holds is answered here, before it, with reads only. */
  override async fetch(request: Request): Promise<Response> {
    if (this.#stored.kind === "missing" && !hasSplitTable(this.ctx.storage.sql)) {
      return request.headers.get("upgrade")?.toLowerCase() === "websocket" ? notFoundSocket() : new Response(null, { status: 404 });
    }
    return super.fetch(request);
  }

  async onStart(): Promise<void> {
    const stored = this.#load();
    this.#stored = stored;
    if (stored.kind === "live" && stored.photo.kind === "held") {
      const alarm = await this.ctx.storage.getAlarm();
      if (alarm === null || alarm > stored.photo.until) await this.ctx.storage.setAlarm(stored.photo.until);
    }
    const sockets = this.ctx.getWebSockets().length;
    if (sockets > 0) console.log(`SplitServer ${this.name} woke from hibernation with ${sockets} open sockets`);
  }

  async onConnect(connection: Connection): Promise<void> {
    const stored = this.#stored;
    if (stored.kind === "live") {
      connection.send(stateMessage(null, stored.photo, stored.json));
      return;
    }
    endConnection(connection, stored);
    if (stored.kind === "missing") await this.ctx.storage.deleteAll();
  }

  onMessage(connection: Connection, message: string | ArrayBuffer): void {
    if (connection.readyState !== WebSocket.READY_STATE_OPEN) return;
    const stored = this.#stored;
    if (stored.kind !== "live") return endConnection(connection, stored);
    const now = Date.now();
    const admission = takeToken(stored.rate.operations, now, OPERATION_LIMIT);
    let rate: Rate = { ...stored.rate, operations: admission.state };
    this.#stored = { ...stored, rate };
    if (!admission.ok) return this.#refuse(connection, now, admission.retryAfterMs);
    this.#pacing.delete(connection);
    const frame = readFrame(message);
    if (!frame.ok) return send(connection, { type: "rejected", ref: frame.ref, rejection: frame.rejection });
    const result = applyOperation(stored.split, frame.op, { creator: isCreator(frame.creatorSecret, stored.secret) }, now);
    if (!result.ok) return send(connection, { type: "rejected", ref: frame.ref, rejection: result.rejection });
    if (!result.changed) return send(connection, { type: "unchanged", ref: frame.ref, revision: stored.split.revision });
    const recorded = result.split.recentChanges.at(-1);
    if (recorded?.revision === result.split.revision) {
      const charge = takeToken(rate.history, now, HISTORY_LIMIT, serializedBytes(recorded));
      rate = { ...rate, history: charge.state };
      this.#stored = { ...stored, rate };
      if (!charge.ok) {
        return send(connection, { type: "rejected", ref: frame.ref, rejection: { reason: "rateLimited", retryAfterMs: charge.retryAfterMs } });
      }
    }
    const json = JSON.stringify(result.split);
    this.ctx.storage.sql.exec(
      "UPDATE split SET json = ?, changed_at = ?, operations_tokens = ?, operations_at = ?, history_tokens = ?, history_at = ?",
      json,
      now,
      rate.operations?.tokens ?? null,
      rate.operations?.at ?? null,
      rate.history?.tokens ?? null,
      rate.history?.at ?? null,
    );
    this.#stored = { ...stored, split: result.split, json, changedAt: now, rate };
    this.broadcast(stateMessage(null, stored.photo, json), [connection.id]);
    connection.send(stateMessage(frame.ref, stored.photo, json));
  }

  async onRequest(request: Request): Promise<Response> {
    const jpeg = request.method === "PUT" ? await request.arrayBuffer() : null;
    const stored = this.#stored;
    if (stored.kind !== "live") {
      if (stored.kind === "missing") await this.ctx.storage.deleteAll();
      return new Response(null, { status: 404 });
    }
    const { photo } = stored;
    if (jpeg === null) {
      if (!showing(photo)) return new Response(null, { status: 404 });
      return new Response(this.ctx.storage.sql.exec<{ jpeg: ArrayBuffer }>("SELECT jpeg FROM photo").one().jpeg);
    }
    if (!isCreator(bearer(request), stored.secret)) return new Response(null, { status: 403 });
    if (photo.kind === "beforePhotos" || Date.now() >= photo.until) return new Response(null, { status: 410 });
    const puts = photo.kind === "held" ? photo.puts + 1 : 1;
    if (puts > PHOTO_PUT_LIMIT) return new Response(null, { status: 429 });
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS photo (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), jpeg BLOB NOT NULL, puts INTEGER NOT NULL)");
    sql.exec("INSERT INTO photo (singleton, jpeg, puts) VALUES (1, ?, 1) ON CONFLICT (singleton) DO UPDATE SET jpeg = excluded.jpeg, puts = puts + 1", jpeg);
    const next: Photo = { kind: "held", until: photo.until, puts };
    this.#stored = { ...stored, photo: next };
    if (photo.kind === "empty") await this.ctx.storage.setAlarm(photo.until);
    this.broadcast(stateMessage(null, next, stored.json));
    return new Response(null, { status: 204 });
  }

  async onAlarm(): Promise<void> {
    const stored = this.#stored;
    if (stored.kind !== "missing") {
      const due = stored.changedAt + SPLIT_TTL_MS;
      if (Date.now() < due) {
        if (stored.kind === "live" && stored.photo.kind === "held") {
          const { until } = stored.photo;
          if (Date.now() < until) return this.ctx.storage.setAlarm(until);
          this.ctx.storage.sql.exec("DELETE FROM photo");
          const gone: Photo = { kind: "empty", until };
          this.#stored = { ...stored, photo: gone };
          this.broadcast(stateMessage(null, gone, stored.json));
        }
        await this.ctx.storage.setAlarm(due);
        return;
      }
      this.#stored = { kind: "missing" };
      for (const connection of this.getConnections()) endConnection(connection, this.#stored);
    }
    await this.ctx.storage.setAlarm(Date.now() + EXPIRY_RETRY_MS);
    await this.ctx.storage.deleteAll();
  }

  #refuse(connection: Connection, now: number, retryAfterMs: number): void {
    send(connection, { type: "rejected", ref: null, rejection: { reason: "rateLimited", retryAfterMs } });
    const pacing = this.#pacing.get(connection);
    const early = pacing === undefined ? 0 : pacing.early + (now < pacing.retryAt ? 1 : 0);
    if (early < MAX_EARLY_FRAMES) {
      this.#pacing.set(connection, { retryAt: now + retryAfterMs, early });
      return;
    }
    connection.close(1008, "rateLimited");
  }

  #photo(until: number): Photo {
    const sql = this.ctx.storage.sql;
    if (sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'photo'").toArray().length === 0) return { kind: "empty", until };
    const [row] = sql.exec<{ puts: number }>("SELECT puts FROM photo").toArray();
    return row ? { kind: "held", until, puts: row.puts } : { kind: "empty", until };
  }

  #load(): Stored {
    const sql = this.ctx.storage.sql;
    if (!hasSplitTable(sql)) return { kind: "missing" };
    const [row] = sql
      .exec<Row>(
        "SELECT *, length(CAST(json AS BLOB)) AS bytes FROM split",
      )
      .toArray();
    if (!row) return { kind: "missing" };
    const unreadable = (why: string): Stored => {
      console.error(`SplitServer ${this.name} stored Split is unreadable: ${why}`);
      return { kind: "unreadable", changedAt: row.changed_at };
    };
    if (row.bytes > MAX_STORED_BYTES) return unreadable(`${row.bytes} bytes is over ${MAX_STORED_BYTES}`);
    const parsed = parseSplit(parseJson(row.json));
    if (!parsed.ok) return unreadable(JSON.stringify(parsed.rejection));
    if (parsed.split.id !== this.name) return unreadable(`it belongs to ${parsed.split.id}`);
    return {
      kind: "live",
      split: parsed.split,
      // A version 1 or 2 row reads mapped to the current model, so clients get the mapped Split rather than the stored text.
      json: JSON.stringify(parsed.split),
      changedAt: row.changed_at,
      secret: new Uint8Array(row.creator_secret),
      rate: { operations: bucketOf(row.operations_tokens, row.operations_at), history: bucketOf(row.history_tokens, row.history_at) },
      photo: row.created_at == null ? { kind: "beforePhotos" } : this.#photo(row.created_at + PHOTO_TTL_MS),
    };
  }
}

function hasSplitTable(sql: SqlStorage): boolean {
  return sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'split'").toArray().length > 0;
}

/** What a client sees for a Split that does not exist, matching the ending a live Durable Object gives a missing one. */
export function notFoundSocket(): Response {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  const { reason, code } = ENDINGS.missing;
  server.send(JSON.stringify({ type: "unavailable", reason } satisfies ServerMessage));
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}

function bucketOf(tokens: number | null, at: number | null): Bucket | null {
  return tokens === null || at === null ? null : { tokens, at };
}

function readFrame(message: string | ArrayBuffer): Frame {
  const oversized = typeof message === "string" ? exceedsBytes(message, MAX_MESSAGE_BYTES) : message.byteLength > MAX_MESSAGE_BYTES;
  if (oversized) return { ok: false, ref: null, rejection: { reason: "messageTooLarge" } };
  const parsed = parseClientMessage(typeof message === "string" ? parseJson(message) : undefined);
  return parsed.ok ? { ok: true, ...parsed.message } : parsed;
}

function isCreator(presented: string | undefined, secret: Uint8Array): boolean {
  if (presented === undefined || !SECRET_PATTERN.test(presented)) return false;
  const bytes = fromBase64Url(presented);
  return bytes.byteLength === secret.byteLength && crypto.subtle.timingSafeEqual(bytes, secret);
}

const ENDINGS = {
  missing: { reason: "notFound", code: 4404 },
  unreadable: { reason: "unreadable", code: 4500 },
} as const;

function endConnection(connection: Connection, stored: Exclude<Stored, { kind: "live" }>): void {
  const { reason, code } = ENDINGS[stored.kind];
  send(connection, { type: "unavailable", reason });
  connection.close(code, reason);
}

function send(connection: Connection, message: ServerMessage): void {
  connection.send(JSON.stringify(message));
}

function showing(photo: Photo): boolean {
  return photo.kind === "held" && Date.now() < photo.until;
}

function stateMessage(ref: string | null, photo: Photo, json: string): string {
  return `{"type":"state","ref":${JSON.stringify(ref)},"photo":${showing(photo)},"split":${json}}`;
}

function bearer(request: Request): string | undefined {
  return /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function exceedsBytes(text: string, cap: number): boolean {
  return text.length > cap || new TextEncoder().encode(text).byteLength > cap;
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

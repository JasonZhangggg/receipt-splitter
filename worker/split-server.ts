import { Server, type Connection } from "partyserver";
import { applyOperation, type Operation, type ServerMessage, type WireRejection } from "../src/core/operations";
import { parseOperation, parseSplit } from "../src/core/parse";
import { SPLIT_BYTE_BUDGET, serializedBytes, type Split } from "../src/core/split";
import { HISTORY_LIMIT, OPERATION_LIMIT, takeToken, type Bucket } from "./rate-limit";

const MAX_MESSAGE_BYTES = 40 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const SPLIT_TTL_MS = 60 * DAY_MS;
const EXPIRY_RETRY_MS = DAY_MS;
const MAX_EARLY_FRAMES = 100;
const HEARTBEAT = { ping: "ping", pong: "pong" } as const;

const SECRET_BYTES = 32;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ENVELOPE_KEYS = new Set(["ref", "op", "creatorSecret"]);

type Stored =
  | { readonly kind: "missing" }
  | { readonly kind: "unreadable"; readonly changedAt: number }
  | {
      readonly kind: "live";
      readonly split: Split;
      readonly json: string;
      readonly changedAt: number;
      readonly secret: Uint8Array;
    };

type Frame =
  | { readonly ok: true; readonly ref: string; readonly op: Operation; readonly creatorSecret: string | undefined }
  | { readonly ok: false; readonly ref: string | null; readonly rejection: WireRejection };

type Pacing = { readonly retryAt: number; readonly early: number };

type Row = { json: string; changed_at: number; creator_secret: ArrayBuffer; bytes: number };

export class SplitServer extends Server<Cloudflare.Env> {
  static options = { hibernate: true };

  #stored: Stored = { kind: "missing" };
  #bucket: Bucket | null = null;
  #history: Bucket | null = null;
  #pacing = new Map<string, Pacing>();

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT.ping, HEARTBEAT.pong));
  }

  async create(split: Split): Promise<{ readonly created: true; readonly creatorSecret: string } | { readonly created: false }> {
    if (split.id !== this.name) throw new Error(`SplitServer ${this.name} cannot hold Split ${split.id}`);
    const sql = this.ctx.storage.sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS split (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), json TEXT NOT NULL, changed_at INTEGER NOT NULL, creator_secret BLOB NOT NULL)",
    );
    if (sql.exec("SELECT 1 FROM split").toArray().length > 0) return { created: false };
    const secret = crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
    const json = JSON.stringify(split);
    const now = Date.now();
    sql.exec("INSERT INTO split (singleton, json, changed_at, creator_secret) VALUES (1, ?, ?, ?)", json, now, secret);
    this.#stored = { kind: "live", split, json, changedAt: now, secret };
    await this.ctx.storage.setAlarm(now + SPLIT_TTL_MS);
    return { created: true, creatorSecret: toBase64Url(secret) };
  }

  onStart(): void {
    this.#stored = this.#load();
    const sockets = this.ctx.getWebSockets().length;
    if (sockets > 0) console.log(`SplitServer ${this.name} woke from hibernation with ${sockets} open sockets`);
  }

  async onConnect(connection: Connection): Promise<void> {
    const stored = this.#stored;
    if (stored.kind === "live") {
      connection.send(stateMessage(null, stored.json));
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
    const admission = takeToken(this.#bucket, now, OPERATION_LIMIT);
    this.#bucket = admission.state;
    if (!admission.ok) return this.#refuse(connection, now, admission.retryAfterMs);
    this.#pacing.delete(connection.id);
    const frame = readFrame(message);
    if (!frame.ok) return send(connection, { type: "rejected", ref: frame.ref, rejection: frame.rejection });
    const result = applyOperation(stored.split, frame.op, { creator: isCreator(frame.creatorSecret, stored.secret) });
    if (!result.ok) return send(connection, { type: "rejected", ref: frame.ref, rejection: result.rejection });
    if (!result.changed) return send(connection, { type: "unchanged", ref: frame.ref, revision: stored.split.revision });
    const recorded = result.split.recentChanges.at(-1);
    if (recorded?.revision === result.split.revision) {
      const charge = takeToken(this.#history, now, HISTORY_LIMIT, serializedBytes(recorded));
      this.#history = charge.state;
      if (!charge.ok) {
        return send(connection, { type: "rejected", ref: frame.ref, rejection: { reason: "rateLimited", retryAfterMs: charge.retryAfterMs } });
      }
    }
    const json = JSON.stringify(result.split);
    this.ctx.storage.sql.exec("UPDATE split SET json = ?, changed_at = ?", json, now);
    this.#stored = { ...stored, split: result.split, json, changedAt: now };
    this.broadcast(stateMessage(null, json), [connection.id]);
    connection.send(stateMessage(frame.ref, json));
  }

  onClose(connection: Connection): void {
    this.#pacing.delete(connection.id);
  }

  async onAlarm(): Promise<void> {
    const stored = this.#stored;
    if (stored.kind !== "missing") {
      const due = stored.changedAt + SPLIT_TTL_MS;
      if (Date.now() < due) {
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
    const pacing = this.#pacing.get(connection.id);
    const early = pacing === undefined ? 0 : pacing.early + (now < pacing.retryAt ? 1 : 0);
    if (early < MAX_EARLY_FRAMES) {
      this.#pacing.set(connection.id, { retryAt: now + retryAfterMs, early });
      return;
    }
    this.#pacing.delete(connection.id);
    connection.close(1008, "rateLimited");
  }

  #load(): Stored {
    const sql = this.ctx.storage.sql;
    if (sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'split'").toArray().length === 0) {
      return { kind: "missing" };
    }
    const [row] = sql
      .exec<Row>("SELECT json, changed_at, creator_secret, length(CAST(json AS BLOB)) AS bytes FROM split")
      .toArray();
    if (!row) return { kind: "missing" };
    const unreadable = (why: string): Stored => {
      console.error(`SplitServer ${this.name} stored Split is unreadable: ${why}`);
      return { kind: "unreadable", changedAt: row.changed_at };
    };
    if (row.bytes > SPLIT_BYTE_BUDGET) return unreadable(`${row.bytes} bytes is over ${SPLIT_BYTE_BUDGET}`);
    const parsed = parseSplit(parseJson(row.json));
    if (!parsed.ok) return unreadable(JSON.stringify(parsed.rejection));
    if (parsed.split.id !== this.name) return unreadable(`it belongs to ${parsed.split.id}`);
    return { kind: "live", split: parsed.split, json: row.json, changedAt: row.changed_at, secret: new Uint8Array(row.creator_secret) };
  }
}

function readFrame(message: string | ArrayBuffer): Frame {
  const oversized = typeof message === "string" ? exceedsBytes(message, MAX_MESSAGE_BYTES) : message.byteLength > MAX_MESSAGE_BYTES;
  if (oversized) return { ok: false, ref: null, rejection: { reason: "messageTooLarge" } };
  const envelope = typeof message === "string" ? parseJson(message) : undefined;
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) return malformed(null, "");
  const fields = new Map<string, unknown>(Object.entries(envelope));
  const ref = fields.get("ref");
  if (typeof ref !== "string" || !REF_PATTERN.test(ref)) return malformed(null, "ref");
  const extra = [...fields.keys()].find((key) => !ENVELOPE_KEYS.has(key));
  if (extra !== undefined) return malformed(ref, extra);
  const creatorSecret = fields.get("creatorSecret");
  if (creatorSecret !== undefined && typeof creatorSecret !== "string") return malformed(ref, "creatorSecret");
  const parsed = parseOperation(fields.get("op"));
  if (!parsed.ok) {
    const { rejection } = parsed;
    return rejection.reason === "malformed" ? malformed(ref, rejection.path === "" ? "op" : `op.${rejection.path}`) : { ok: false, ref, rejection };
  }
  return { ok: true, ref, op: parsed.op, creatorSecret };
}

function malformed(ref: string | null, path: string): Frame {
  return { ok: false, ref, rejection: { reason: "malformed", path } };
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

function stateMessage(ref: string | null, json: string): string {
  return `{"type":"state","ref":${JSON.stringify(ref)},"split":${json}}`;
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

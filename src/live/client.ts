import { PartySocket } from "partysocket";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { landed, type CreateSplitRefusal, type CreateSplitRequest, type CreateSplitResponse, type Operation, type Optimistic, type ServerMessage, type WireRejection } from "../core/operations";
import { isRoutableSplitId, participantId, randomId, type ParticipantId, type Split, type SplitId } from "../core/split";
import { createCopy } from "../ui/home-copy";
import { firstSight, forgetFirstSight, keepCreated, takeEarlySocket } from "./first-sight";
import { answerByMs, connectionOf, slowAfterMs, type Connection } from "./connection";
import type { ReceiptJpeg } from "../ui/receipt-input/jpeg";
import { drop, fold, lay, received, refOf, type Seen } from "./layer";

export type GoneReason = "notFound" | "unreadable";

export type Live =
  | { readonly status: "connecting" }
  /** `split` is what to show: the server's `server` Split with this phone's unanswered operations laid over it. */
  | { readonly status: "live"; readonly split: Split; readonly server: Split; readonly photo: boolean }
  | { readonly status: "gone"; readonly reason: GoneReason };

/** `revision` is the Split's revision once the Operation is in, which is the one an undo of it names. It is null when the Operation changed nothing (`unchanged`): there is no revision of its own to undo. */
export type Answer = { readonly ok: true; readonly revision: number | null } | { readonly ok: false; readonly rejection: WireRejection | { readonly reason: "disconnected" } };

type Send = (op: Operation, creatorSecret?: string) => Promise<Answer>;

/**
 * Shows `op` on the Split at once and sends it. Not sent (the socket is closed) means nothing was laid and the caller says so now.
 * The answer is ok when the server took it, or when it never answered in time but the Split it sent next already holds the op's effect.
 * A refusal or a failure takes the op off the Split again, so the caller's only job is to say what didn't apply.
 */
export type Act = (op: Optimistic) => { readonly sent: false } | { readonly sent: true; readonly answer: Promise<Answer> };

export function newParticipantId(): ParticipantId {
  return participantId(randomId(12));
}

export function splitUrl(id: SplitId): string {
  return `${globalThis.location?.origin ?? ""}/s/${id}`;
}

const endings: Record<number, GoneReason> = { 4404: "notFound", 4500: "unreadable" };

/**
 * One action waiting for the server. `slowTimer` marks it stalled. `deadline` fires when no answer came in time: the action may still have been applied, so the socket reconnects
 * and the entry waits (`late`) for the server's join state, which settles the truth before the caller hears of the failure. A second `deadline` bounds that wait.
 * `op` is set when the action is laid over the Split (`act`); it leaves the Split exactly when the entry settles. `sent` is false while PartySocket still buffers the frame, before the first open.
 */
type Waiting = { readonly resolve: (answer: Answer) => void; readonly op: Optimistic | null; readonly slowTimer: ReturnType<typeof setTimeout>; deadline: ReturnType<typeof setTimeout>; stalled: boolean; late: boolean; sent: boolean };

const disconnected: Answer = { ok: false, rejection: { reason: "disconnected" } };
/**
 * How long PartySocket waits before its first retry after a drop. Its default is 3 s, and a phone that reopens a tab always finds the socket dead, so every reopen would sit through the full 3 s.
 * Retries after that still back off (x1.3 each, up to PartySocket's 10 s), and a socket that opens and drops again within 5 s keeps its backoff.
 * `reconnect()` cannot skip the wait: while one is pending it does nothing.
 */
const firstRetryMs = 500;
const browserIsOnline = () => globalThis.navigator?.onLine !== false;

export function useLiveSplit(id: string | null): { live: Live; send: Send; act: Act; connection: Connection; idle: boolean } {
  // The first render shows a Split already in hand (just created here, or the early socket's newest state) instead of waiting for this hook's own socket to say so.
  const [seen, setSeen] = useState<Seen | null>(() => {
    const sight = id === null || !isRoutableSplitId(id) ? null : firstSight(id);
    return id !== null && sight ? { id, base: { status: "live", split: sight.split, photo: sight.photo }, laid: [] } : null;
  });
  const server = useRef<Split | null>(null);
  const [inFlight, setInFlight] = useState(0);
  const socket = useRef<PartySocket | null>(null);
  /** Whether this link has ever opened. Until then a send waits for the open; after a drop it is refused (see `send`). */
  const everOpened = useRef(false);
  const pending = useRef(new Map<string, Waiting>());
  const nextRef = useRef(0);
  const [socketOpen, setSocketOpen] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(browserIsOnline);
  const [stalled, setStalled] = useState(0);
  const [joined, setJoined] = useState(0);
  const reopening = useRef(false);

  const settle = useCallback((ref: string | null, answer: Answer) => {
    if (ref === null) return;
    const entry = pending.current.get(ref);
    if (!entry) return;
    pending.current.delete(ref);
    clearTimeout(entry.slowTimer);
    clearTimeout(entry.deadline);
    if (entry.stalled) setStalled((count) => count - 1);
    setInFlight((count) => count - 1);
    // A failed answer is not a failure when the server's Split already holds what was asked: the answer never came but the action landed, or the refusal says it was already so (a duplicate id, a line already gone, an undo already done).
    const held = entry.op !== null && !answer.ok && server.current !== null && landed(server.current, entry.op);
    if (entry.op) setSeen((was) => was && drop(was, new Set([ref])));
    entry.resolve(held ? { ok: true, revision: null } : answer);
  }, []);

  // Runs after the render of the join state, so a caller hearing "disconnected" for a timed-out action already sees the Split the server holds.
  useEffect(() => {
    for (const [ref, entry] of [...pending.current]) if (entry.late) settle(ref, disconnected);
  }, [joined, settle]);

  useEffect(() => {
    const sync = () => setBrowserOnline(browserIsOnline());
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    if (id === null || !isRoutableSplitId(id)) return;
    const update = (change: (was: Seen) => Seen) => setSeen((was) => change(was !== null && was.id === id ? was : { id, base: { status: "connecting" }, laid: [] }));
    const waiting = pending.current;
    // Read before the early socket is taken: the Split on screen from the first render is what a laid action sits on until the join state arrives.
    server.current = firstSight(id)?.split ?? null;
    const early = takeEarlySocket(id);
    const ws = new PartySocket({
      host: location.host,
      protocol: location.protocol === "https:" ? "wss" : "ws",
      party: "split-server",
      room: id,
      minReconnectionDelay: firstRetryMs,
      ...(early && { WebSocket: early.socket }),
    });
    socket.current = ws;
    everOpened.current = false;
    ws.addEventListener("open", () => {
      everOpened.current = true;
      for (const entry of waiting.values()) entry.sent = true;
      setSocketOpen(true);
    });
    ws.addEventListener("message", ({ data }: MessageEvent<string>) => {
      const message: ServerMessage = JSON.parse(data);
      if (message.type === "state") server.current = message.split;
      // The Split and the queue of laid operations change in one step, keyed by the answered ref.
      const late = new Set([...waiting].filter(([, entry]) => entry.late && entry.op !== null).map(([ref]) => ref));
      update((was) => received(was, message, late));
      switch (message.type) {
        case "state":
          forgetFirstSight(id);
          if (message.ref === null) setJoined((count) => count + 1);
          return settle(message.ref, { ok: true, revision: message.split.revision });
        case "unchanged":
          return settle(message.ref, { ok: true, revision: null });
        case "rejected": {
          if (message.ref !== null) return settle(message.ref, { ok: false, rejection: message.rejection });
          // Refused before its ref was read (a rate limit): the server answers in the order it read, so this was the oldest action still waiting on this socket.
          const [oldest] = [...waiting].find(([, entry]) => !entry.late) ?? [];
          return oldest === undefined ? undefined : settle(oldest, { ok: false, rejection: message.rejection });
        }
        case "unavailable":
          return ws.close();
      }
    });
    ws.addEventListener("close", ({ code }: CloseEvent) => {
      setSocketOpen(false);
      // An action sent before the first open and still waiting in PartySocket's buffer must not go out when the socket reopens.
      ws.drainQueuedMessages();
      const reason = endings[code];
      for (const [ref, entry] of [...waiting]) {
        // Never reached the server (dropped from the buffer above), so there is nothing to wait for.
        if (!entry.sent) {
          settle(ref, disconnected);
          continue;
        }
        if (reopening.current && entry.late) continue;
        // A laid action keeps showing until the join state says whether it landed, or the wait runs out.
        if (reason === undefined && socket.current === ws && entry.op !== null) {
          if (!entry.late) {
            entry.late = true;
            clearTimeout(entry.deadline);
            entry.deadline = setTimeout(() => settle(ref, disconnected), answerByMs);
          }
          continue;
        }
        settle(ref, disconnected);
      }
      if (reason === undefined) return;
      ws.close();
      update((was) => ({ ...was, base: { status: "gone", reason } }));
    });
    return () => {
      ws.close();
      early?.release();
      socket.current = null;
      setSocketOpen(false);
    };
  }, [id, settle]);

  // PartySocket would buffer a send made while closed and replay it on reconnect, against a Split other devices may have changed since, so a send is refused instead.
  // The first connection is the exception: the page can show a Split before its socket has opened, and a tap in that gap goes out the moment the link does, on a Split at most one round trip old.
  const canSend = useCallback((ws: PartySocket) => ws.readyState === ws.OPEN || (ws.readyState === ws.CONNECTING && !everOpened.current && browserIsOnline()), []);
  const transmit = useCallback(
    (seq: number, op: Operation, creatorSecret: string | undefined, laid: Optimistic | null): Promise<Answer> => {
      const ws = socket.current;
      if (!ws || !canSend(ws)) return Promise.resolve(disconnected);
      const ref = refOf(seq);
      return new Promise((resolve) => {
        const entry: Waiting = {
          resolve,
          op: laid,
          stalled: false,
          slowTimer: setTimeout(() => {
            entry.stalled = true;
            setStalled((count) => count + 1);
          }, slowAfterMs),
          deadline: setTimeout(() => {
            entry.late = true;
            entry.deadline = setTimeout(() => settle(ref, disconnected), answerByMs);
            reopening.current = true;
            ws.reconnect();
            reopening.current = false;
          }, answerByMs),
          late: false,
          sent: ws.readyState === ws.OPEN,
        };
        pending.current.set(ref, entry);
        setInFlight((count) => count + 1);
        ws.send(JSON.stringify(creatorSecret === undefined ? { ref, op } : { ref, op, creatorSecret }));
      });
    },
    [settle, canSend],
  );

  const send = useCallback<Send>((op, creatorSecret) => transmit(nextRef.current++, op, creatorSecret, null), [transmit]);

  const act = useCallback<Act>(
    (op) => {
      const ws = socket.current;
      if (id === null || !ws || !canSend(ws)) return { sent: false };
      const seq = nextRef.current++;
      setSeen((was) => (was !== null && was.id === id && was.base.status === "live" ? lay(was, { seq, ref: refOf(seq), op }) : was));
      return { sent: true, answer: transmit(seq, op, undefined, op) };
    },
    [id, transmit, canSend],
  );

  const mine = seen !== null && seen.id === id ? seen : null;
  const shown = useMemo((): Live => {
    const base = mine?.base;
    if (base === undefined || base.status === "connecting") return { status: "connecting" };
    if (base.status === "gone") return base;
    return { status: "live", split: fold(base.split, mine?.laid ?? []), server: base.split, photo: base.photo };
  }, [mine?.base, mine?.laid]);

  const live: Live = id !== null && !isRoutableSplitId(id) ? { status: "gone", reason: "notFound" } : shown;
  return { live, send, act, connection: connectionOf({ socketOpen, browserOnline, stalled }), idle: inFlight === 0 };
}

export type Created = { readonly ok: true; readonly id: SplitId; readonly creatorSecret: string } | { readonly ok: false; readonly reason: string };

export async function createSplitLink(request: CreateSplitRequest): Promise<Created> {
  let response: Response;
  try {
    response = await fetch("/api/splits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
  } catch {
    return { ok: false, reason: createCopy.offline };
  }
  if (response.status === 201) {
    const { id, creatorSecret, split }: CreateSplitResponse = await response.json();
    keepCreated(split);
    return { ok: true, id, creatorSecret };
  }
  const refusal: CreateSplitRefusal | null = await response.json().catch(() => null);
  return { ok: false, reason: refusalReason(refusal) };
}

export type PhotoSent = "stored" | "refused" | "failed";

/** The Worker takes two PUTs per Split, so the upload tries twice at most, and a refusal is final. */
export async function sendPhoto(id: SplitId, creatorSecret: string, photo: ReceiptJpeg): Promise<PhotoSent> {
  let sent: PhotoSent = "failed";
  for (let attempt = 0; attempt < 2 && sent === "failed"; attempt += 1) {
    const status = await fetch(`/api/splits/${id}/photo`, {
      method: "PUT",
      headers: { "content-type": "image/jpeg", authorization: `Bearer ${creatorSecret}` },
      body: photo,
    }).then(
      (response) => response.status,
      () => 0,
    );
    sent = status >= 200 && status < 300 ? "stored" : status >= 400 && status < 500 ? "refused" : "failed";
  }
  return sent;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function refusalReason(refusal: CreateSplitRefusal | null): string {
  switch (refusal?.refused) {
    case "rateLimited":
      return createCopy.busy;
    case "dailyLimit": {
      const now = new Date();
      const opens = new Date(Math.ceil((now.getTime() + 1) / DAY_MS) * DAY_MS);
      return createCopy.daily(opens.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), opens.toDateString() !== now.toDateString());
    }
    case "unavailable":
    case undefined:
      return createCopy.network;
    case "rejected":
      return refusal.rejection.reason === "badHandle" ? createCopy.handle : createCopy.other;
    case "bodyTooLarge":
      return createCopy.other;
  }
}

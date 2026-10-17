import { PartySocket } from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CreateSplitRefusal, CreateSplitRequest, CreateSplitResponse, Operation, ServerMessage, WireRejection } from "../core/operations";
import { isRoutableSplitId, participantId, randomId, type ParticipantId, type Split, type SplitId } from "../core/split";
import { createCopy } from "../ui/home-copy";
import { answerByMs, connectionOf, slowAfterMs, type Connection } from "./connection";
import type { ReceiptJpeg } from "../ui/receipt-input/jpeg";

export type GoneReason = "notFound" | "unreadable";

export type Live =
  | { readonly status: "connecting" }
  | { readonly status: "live"; readonly split: Split; readonly photo: boolean }
  | { readonly status: "gone"; readonly reason: GoneReason };

/** `revision` is the Split's revision once the Operation is in, which is the one an undo of it names. It is null when the Operation changed nothing (`unchanged`): there is no revision of its own to undo. */
export type Answer = { readonly ok: true; readonly revision: number | null } | { readonly ok: false; readonly rejection: WireRejection | { readonly reason: "disconnected" } };

type Send = (op: Operation, creatorSecret?: string) => Promise<Answer>;

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
 */
type Waiting = { readonly resolve: (answer: Answer) => void; readonly slowTimer: ReturnType<typeof setTimeout>; deadline: ReturnType<typeof setTimeout>; stalled: boolean; late: boolean };

const disconnected: Answer = { ok: false, rejection: { reason: "disconnected" } };
/**
 * How long PartySocket waits before its first retry after a drop. Its default is 3 s, and a phone that reopens a tab always finds the socket dead, so every reopen would sit through the full 3 s.
 * Retries after that still back off (x1.3 each, up to PartySocket's 10 s), and a socket that opens and drops again within 5 s keeps its backoff.
 * `reconnect()` cannot skip the wait: while one is pending it does nothing.
 */
const firstRetryMs = 500;
const browserIsOnline = () => globalThis.navigator?.onLine !== false;

export function useLiveSplit(id: string | null): { live: Live; send: Send; connection: Connection } {
  const [seen, setSeen] = useState<{ readonly id: string; readonly live: Live } | null>(null);
  const socket = useRef<PartySocket | null>(null);
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
    entry.resolve(answer);
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
    const setLive = (live: Live) => setSeen({ id, live });
    const waiting = pending.current;
    const ws = new PartySocket({
      host: location.host,
      protocol: location.protocol === "https:" ? "wss" : "ws",
      party: "split-server",
      room: id,
      minReconnectionDelay: firstRetryMs,
    });
    socket.current = ws;
    ws.addEventListener("open", () => setSocketOpen(true));
    ws.addEventListener("message", ({ data }: MessageEvent<string>) => {
      const message: ServerMessage = JSON.parse(data);
      switch (message.type) {
        case "state":
          setLive({ status: "live", split: message.split, photo: message.photo });
          if (message.ref === null) setJoined((count) => count + 1);
          return settle(message.ref, { ok: true, revision: message.split.revision });
        case "unchanged":
          return settle(message.ref, { ok: true, revision: null });
        case "rejected":
          return settle(message.ref, { ok: false, rejection: message.rejection });
        case "unavailable":
          ws.close();
          return setLive({ status: "gone", reason: message.reason });
      }
    });
    ws.addEventListener("close", ({ code }: CloseEvent) => {
      setSocketOpen(false);
      for (const [ref, entry] of [...waiting]) if (!(reopening.current && entry.late)) settle(ref, disconnected);
      const reason = endings[code];
      if (reason === undefined) return;
      ws.close();
      setLive({ status: "gone", reason });
    });
    return () => {
      ws.close();
      socket.current = null;
      setSocketOpen(false);
    };
  }, [id, settle]);

  const send = useCallback<Send>((op, creatorSecret) => {
    const ws = socket.current;
    // PartySocket would buffer a send made while closed and replay it on reconnect, against a Split other devices may have changed since. Refuse it now instead.
    if (!ws || ws.readyState !== ws.OPEN) return Promise.resolve(disconnected);
    const ref = `r${nextRef.current++}`;
    return new Promise((resolve) => {
      const entry: Waiting = {
        resolve,
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
      };
      pending.current.set(ref, entry);
      ws.send(JSON.stringify(creatorSecret === undefined ? { ref, op } : { ref, op, creatorSecret }));
    });
  }, [settle]);

  const live: Live =
    id !== null && !isRoutableSplitId(id) ? { status: "gone", reason: "notFound" } : seen !== null && seen.id === id ? seen.live : { status: "connecting" };
  return { live, send, connection: connectionOf({ socketOpen, browserOnline, stalled }) };
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
    const { id, creatorSecret }: CreateSplitResponse = await response.json();
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

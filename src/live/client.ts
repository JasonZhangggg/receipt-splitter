import { PartySocket } from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CreateSplitRefusal, CreateSplitRequest, CreateSplitResponse, Operation, ServerMessage, WireRejection } from "../core/operations";
import { isRoutableSplitId, participantId, randomId, type ParticipantId, type Split, type SplitId } from "../core/split";
import { createCopy } from "../ui/home-copy";

export type GoneReason = "notFound" | "unreadable";

export type Live =
  | { readonly status: "connecting" }
  | { readonly status: "live"; readonly split: Split; readonly photo: boolean }
  | { readonly status: "gone"; readonly reason: GoneReason };

export type Answer = { readonly ok: true } | { readonly ok: false; readonly rejection: WireRejection | { readonly reason: "disconnected" } };

type Send = (op: Operation, creatorSecret?: string) => Promise<Answer>;

export function newParticipantId(): ParticipantId {
  return participantId(randomId(12));
}

export function splitUrl(id: SplitId): string {
  return `${globalThis.location?.origin ?? ""}/s/${id}`;
}

const endings: Record<number, GoneReason> = { 4404: "notFound", 4500: "unreadable" };

export function useLiveSplit(id: string | null): { live: Live; send: Send } {
  const [seen, setSeen] = useState<{ readonly id: string; readonly live: Live } | null>(null);
  const socket = useRef<PartySocket | null>(null);
  const pending = useRef(new Map<string, (answer: Answer) => void>());
  const nextRef = useRef(0);

  useEffect(() => {
    if (id === null || !isRoutableSplitId(id)) return;
    const setLive = (live: Live) => setSeen({ id, live });
    const waiting = pending.current;
    const ws = new PartySocket({
      host: location.host,
      protocol: location.protocol === "https:" ? "wss" : "ws",
      party: "split-server",
      room: id,
    });
    socket.current = ws;
    const settle = (ref: string | null, answer: Answer) => {
      if (ref === null) return;
      waiting.get(ref)?.(answer);
      waiting.delete(ref);
    };
    ws.addEventListener("message", ({ data }: MessageEvent<string>) => {
      const message: ServerMessage = JSON.parse(data);
      switch (message.type) {
        case "state":
          setLive({ status: "live", split: message.split, photo: message.photo });
          return settle(message.ref, { ok: true });
        case "unchanged":
          return settle(message.ref, { ok: true });
        case "rejected":
          return settle(message.ref, { ok: false, rejection: message.rejection });
        case "unavailable":
          ws.close();
          return setLive({ status: "gone", reason: message.reason });
      }
    });
    ws.addEventListener("close", ({ code }: CloseEvent) => {
      for (const ref of [...waiting.keys()]) settle(ref, { ok: false, rejection: { reason: "disconnected" } });
      const reason = endings[code];
      if (reason === undefined) return;
      ws.close();
      setLive({ status: "gone", reason });
    });
    return () => {
      ws.close();
      socket.current = null;
    };
  }, [id]);

  const send = useCallback<Send>((op, creatorSecret) => {
    const ws = socket.current;
    if (!ws) return Promise.resolve({ ok: false, rejection: { reason: "disconnected" } });
    const ref = `r${nextRef.current++}`;
    return new Promise((resolve) => {
      pending.current.set(ref, resolve);
      ws.send(JSON.stringify(creatorSecret === undefined ? { ref, op } : { ref, op, creatorSecret }));
    });
  }, []);

  const live: Live =
    id !== null && !isRoutableSplitId(id) ? { status: "gone", reason: "notFound" } : seen !== null && seen.id === id ? seen.live : { status: "connecting" };
  return { live, send };
}

export type Created = { readonly ok: true; readonly id: SplitId; readonly creatorSecret: string } | { readonly ok: false; readonly reason: string };

export async function createSplitLink(request: CreateSplitRequest): Promise<Created> {
  let response: Response;
  try {
    response = await fetch("/api/splits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
  } catch {
    return { ok: false, reason: createCopy.network };
  }
  if (response.status === 201) {
    const { id, creatorSecret }: CreateSplitResponse = await response.json();
    return { ok: true, id, creatorSecret };
  }
  const refusal: CreateSplitRefusal | null = await response.json().catch(() => null);
  return { ok: false, reason: refusalReason(refusal) };
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

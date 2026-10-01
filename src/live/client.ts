import { PartySocket } from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CreateSplitRefusal, CreateSplitRequest, CreateSplitResponse, Operation, ServerMessage, WireRejection } from "../core/operations";
import { isRoutableSplitId, participantId, type ParticipantId, type Split, type SplitId } from "../core/split";

export type Live =
  | { readonly status: "connecting" }
  | { readonly status: "live"; readonly split: Split }
  | { readonly status: "gone"; readonly reason: "notFound" | "unreadable" };

export type Answer = { readonly ok: true } | { readonly ok: false; readonly rejection: WireRejection | { readonly reason: "disconnected" } };

type Send = (op: Operation, creatorSecret?: string) => Promise<Answer>;

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export function newParticipantId(): ParticipantId {
  return participantId(Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => ID_ALPHABET[byte & 63]).join(""));
}

export function splitUrl(id: SplitId): string {
  return `${globalThis.location?.origin ?? ""}/s/${id}`;
}

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
      const resolve = ref === null ? undefined : waiting.get(ref);
      if (!resolve || ref === null) return;
      waiting.delete(ref);
      resolve(answer);
    };
    ws.addEventListener("message", ({ data }: MessageEvent<string>) => {
      const message: ServerMessage = JSON.parse(data);
      switch (message.type) {
        case "state":
          setLive({ status: "live", split: message.split });
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
    ws.addEventListener("close", () => {
      for (const ref of [...waiting.keys()]) settle(ref, { ok: false, rejection: { reason: "disconnected" } });
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

const reasons = {
  turnstile: "Couldn't check this browser. Try again.",
  busy: "Too many links from here. Try again in a minute.",
  network: "Couldn't reach the server. Try again.",
  handle: "Check how to pay you.",
  other: "Couldn't create the link. Try again.",
};

export async function createSplitLink(request: CreateSplitRequest): Promise<Created> {
  let response: Response;
  try {
    response = await fetch("/api/splits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
  } catch {
    return { ok: false, reason: reasons.network };
  }
  if (response.status === 201) {
    const { id, creatorSecret }: CreateSplitResponse = await response.json();
    return { ok: true, id, creatorSecret };
  }
  const refusal: CreateSplitRefusal | null = await response.json().catch(() => null);
  return { ok: false, reason: refusalReason(refusal) };
}

function refusalReason(refusal: CreateSplitRefusal | null): string {
  switch (refusal?.refused) {
    case "turnstileFailed":
      return reasons.turnstile;
    case "rateLimited":
      return reasons.busy;
    case "turnstileUnavailable":
    case undefined:
      return reasons.network;
    case "rejected":
      return refusal.rejection.reason === "badHandle" ? reasons.handle : reasons.other;
    case "bodyTooLarge":
      return reasons.other;
  }
}

export const turnstileFailure = reasons.turnstile;

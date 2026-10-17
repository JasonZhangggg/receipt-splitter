import type { ServerMessage } from "../core/operations";
import type { Split } from "../core/split";

/** What the Split page can show before its own socket has said anything. */
export type FirstSight = { readonly split: Split; readonly photo: boolean };

/**
 * The socket public/index.html opens for a Split link before the bundle has downloaded, with every event it saw since. `events` is null once a hook has taken it over.
 * The inline script and this file share the shape, so change them together (src/ui/boot.test.ts reads the script).
 */
type Early = { readonly id: string; readonly ws: WebSocket; events: Event[] | null };

declare global {
  interface Window {
    splitwithSocket?: Early;
  }
}

const created = new Map<string, Split>();

/** `createSplitLink` keeps the Split the Worker just created, so the page the Host opens next shows it without waiting for the socket. */
export function keepCreated(split: Split) {
  created.set(split.id, split);
}

/** The Split to show on the first render of `id`, if one is already in hand: the one just created here, else the first state the early socket received. */
export function firstSight(id: string): FirstSight | null {
  const own = created.get(id);
  if (own) return { split: own, photo: false };
  const early = globalThis.window?.splitwithSocket;
  if (early?.id !== id || !early.events) return null;
  for (const event of early.events) {
    if (!(event instanceof MessageEvent)) continue;
    const message: ServerMessage = JSON.parse(event.data);
    if (message.type === "state") return { split: message.split, photo: message.photo };
  }
  return null;
}

/** The server's word on `id` has arrived on the page's own socket, so what `firstSight` kept is no longer needed. */
export function forgetFirstSight(id: string) {
  created.delete(id);
}

type SocketConstructor = new (url: string) => WebSocket;

/**
 * A constructor for PartySocket's `WebSocket` option. Its first call hands back the early socket, so the page's connection started when the HTML did; every call after that,
 * a reconnect, builds a plain socket. The events the early socket saw are replayed in a microtask, after PartySocket has put its four listeners on it and before any new event can fire.
 * Undefined when there is no early socket for `id`, and PartySocket then builds its own. An early socket for another Split is closed.
 */
export function takeEarlySocket(id: string): SocketConstructor | undefined {
  const early = globalThis.window?.splitwithSocket;
  if (!early) return undefined;
  delete globalThis.window.splitwithSocket;
  if (early.id !== id || !early.events) {
    early.ws.close();
    return undefined;
  }
  const { ws, events } = early;
  let spent = false;
  return function (url: string) {
    if (spent) return new WebSocket(url);
    spent = true;
    // The inline script keeps recording into `events` until now, so nothing that arrives between the hook's effect and PartySocket's first connect is lost.
    early.events = null;
    queueMicrotask(() => {
      for (const event of events) ws.dispatchEvent(new (event.constructor as typeof Event)(event.type, event));
    });
    return ws;
  } as unknown as SocketConstructor;
}

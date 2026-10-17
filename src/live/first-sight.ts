import type { Split } from "../core/split";

/** What the Split page can show before its own socket has said anything. */
export type FirstSight = { readonly split: Split; readonly photo: boolean };

const created = new Map<string, Split>();

/** `createSplitLink` keeps the Split the Worker just created, so the page the Host opens next shows it without waiting for the socket. */
export function keepCreated(split: Split) {
  created.set(split.id, split);
}

/** The Split to show on the first render of `id`, if one is already in hand: the one just created here. */
export function firstSight(id: string): FirstSight | null {
  const own = created.get(id);
  return own ? { split: own, photo: false } : null;
}

/** The server's word on `id` has arrived on the page's own socket, so what `firstSight` kept is no longer needed. */
export function forgetFirstSight(id: string) {
  created.delete(id);
}

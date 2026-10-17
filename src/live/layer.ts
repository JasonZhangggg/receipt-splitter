import { applyOperation, type Optimistic, type ServerMessage } from "../core/operations";
import type { Split } from "../core/split";

/**
 * Operations this phone has sent and the server has not yet answered, laid over the server's Split so a tap shows at once.
 * `seq` is the number in `ref` (`r<seq>`); refs count up per socket owner and the server answers in the order it read them.
 */
export type Laid = { readonly seq: number; readonly ref: string; readonly op: Optimistic };

export type Base = { readonly status: "connecting" } | { readonly status: "gone"; readonly reason: "notFound" | "unreadable" } | { readonly status: "live"; readonly split: Split; readonly photo: boolean };

/** What the hook holds for one Split id: the server's side and the ops laid over it. They change together, so no render shows an answered op twice. */
export type Seen = { readonly id: string; readonly base: Base; readonly laid: readonly Laid[] };

export const refOf = (seq: number) => `r${seq}`;
const seqOf = (ref: string) => Number(ref.slice(1));

/**
 * The Split a phone shows: the server's with each laid op applied in send order, which is the order the server applies them.
 * An op the Split refuses (its Item is gone, a name is taken) is skipped, as the server will skip it. Revision and history stay the server's: a Revert names a revision, and a guessed one could undo someone else's change.
 */
export function fold(server: Split, laid: readonly Laid[]): Split {
  let top = server;
  for (const { op } of laid) {
    const applied = applyOperation(top, op, { creator: false });
    if (applied.ok) top = applied.split;
  }
  return top === server ? server : { ...top, revision: server.revision, recentChanges: server.recentChanges };
}

const keeping = (laid: readonly Laid[], keep: (entry: Laid) => boolean): readonly Laid[] => {
  const kept = laid.filter(keep);
  return kept.length === laid.length ? laid : kept;
};

/** Adds an op at the end of the queue. */
export function lay(seen: Seen, entry: Laid): Seen {
  return { ...seen, laid: [...seen.laid, entry] };
}

/** Takes ops out of the queue by ref. The view then shows the server's Split without them: a rollback. */
export function drop(seen: Seen, refs: ReadonlySet<string>): Seen {
  const laid = keeping(seen.laid, ({ ref }) => !refs.has(ref));
  return laid === seen.laid ? seen : { ...seen, laid };
}

/**
 * What a server message does to the Split and the queue, in one step.
 * An answer to ref r means the server has dealt with r and every op before it, so those leave the queue as the Split that includes them arrives.
 * Another phone's change, the join snapshot or the photo (a state with no ref) replaces the Split and leaves the queue to be replayed on top, except the ops in `late`:
 * those were sent before a reconnect, and the snapshot is the server's whole word on whether they landed.
 */
export function received(seen: Seen, message: ServerMessage, late: ReadonlySet<string>): Seen {
  switch (message.type) {
    case "state": {
      const base: Base = { status: "live", split: message.split, photo: message.photo };
      const answered = message.ref === null ? null : seqOf(message.ref);
      return { ...seen, base, laid: keeping(seen.laid, ({ seq, ref }) => (answered === null ? !late.has(ref) : seq > answered)) };
    }
    case "unchanged":
    case "rejected": {
      if (message.ref === null) return seen;
      const answered = seqOf(message.ref);
      const laid = keeping(seen.laid, ({ seq }) => seq > answered);
      return laid === seen.laid ? seen : { ...seen, laid };
    }
    case "unavailable":
      return { ...seen, base: { status: "gone", reason: message.reason } };
  }
}

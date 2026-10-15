/** What the Split page knows about its link to the server. `slow` means the socket is open but an action has waited past `slowAfterMs` for its answer. */
export type Connection = "online" | "slow" | "offline";

/** The offline notice waits this long, so a blip that reconnects at once never shows it. */
export const noticeAfterMs = 1500;
/** An open socket whose action has had no answer for this long is called slow. */
export const slowAfterMs = 3000;
/** An action with no answer for this long settles as failed, so no send waits forever. */
export const answerByMs = 10_000;

export type Link = {
  /** The socket's `open` event has fired and its `close` has not. */
  readonly socketOpen: boolean;
  /** `navigator.onLine`, which flips before a dead socket notices. */
  readonly browserOnline: boolean;
  /** Actions sent on this socket that have waited past `slowAfterMs` and are still unanswered. */
  readonly stalled: number;
};

export function connectionOf({ socketOpen, browserOnline, stalled }: Link): Connection {
  if (!socketOpen || !browserOnline) return "offline";
  return stalled > 0 ? "slow" : "online";
}

/** The reopened link must stay up this long before the offline notice goes, so a link that opens and drops in a loop does not blink it. */
export const reopenHoldMs = 1000;

export type Notice = "offline" | "slow" | null;

/**
 * What the notice should become for `connection`, and how long to wait before it does, given what shows now.
 * A notice already on screen never waits again to change (slow goes straight to offline), and offline leaves only after `reopenHoldMs` of a steady link.
 */
export function nextNotice(connection: Connection, showing: Notice): { readonly notice: Notice; readonly afterMs: number } {
  if (connection === "slow") return { notice: "slow", afterMs: 0 };
  if (connection === "offline") return { notice: "offline", afterMs: showing === null ? noticeAfterMs : 0 };
  return { notice: null, afterMs: showing === "offline" ? reopenHoldMs : 0 };
}

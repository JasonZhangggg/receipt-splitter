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

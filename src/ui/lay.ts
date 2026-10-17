import type { Optimistic } from "../core/operations";
import type { Answer } from "../live/client";

/**
 * Shows an Operation on the Split now and sends it; false means the connection is down and nothing was shown or sent.
 * When the server refuses it or never answers, the page takes it back off the Split and says so in its bar: `said` words that line (null says nothing), and `retry` adds Try again when the cause is only the connection or the pace.
 */
export type Lay = (
  op: Optimistic,
  how?: {
    readonly then?: (answer: Extract<Answer, { ok: true }>) => void;
    readonly said?: (answer: Extract<Answer, { ok: false }>) => string | null;
    readonly retry?: boolean;
  },
) => boolean;

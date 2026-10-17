# Optimistic actions (brief items 2 and 3): design

Read against origin/main f993c75. Line numbers below are on that commit. The brief was written against cf4ef7d, so a few of its line numbers have shifted by one to three lines.

## 1. Data shape

The layer lives in `useLiveSplit` (src/live/client.ts). That hook already owns the server Split (`seen`, :48) and the `pending` map keyed by ref (:50). Base and layer must change in one state update. If they don't, one render shows the answered op twice.

```ts
// src/live/client.ts
/** The ops that go through the layer. Each one is absolute or guarded by an id, so applying it again on a Split that already holds it changes nothing (see 4). */
export type Optimistic = Extract<Operation, { type: "claim" | "unclaim" | "recordPayment" | "clearPayment" | "undo" }>
  | (Extract<Operation, { type: "editReceipt" }> & { items?: readonly Extract<ItemPatch, { type: "add" | "delete" }>[]; adjustments?: readonly Extract<AdjustmentPatch, { type: "add" | "delete" }>[]; subtotalDelta?: never; totalDelta?: never });

type Laid = { readonly seq: number; readonly ref: string; readonly op: Optimistic };
type Seen = { readonly id: string; readonly live: Live; readonly laid: readonly Laid[] }; // replaces `seen`; `laid` is in send order

export type Live = { status: "connecting" } | { status: "gone"; reason: GoneReason }
  | { status: "live"; split: Split /* view: base + laid */; server: Split /* base, for "did it land" checks */; photo: boolean };

type Act = (op: Optimistic) => { readonly sent: false } | { readonly sent: true; readonly answer: Promise<Answer> };
// useLiveSplit returns { live, send, act, connection }. `send` stays as it is for ops that never go through the layer.
```

The view is computed as `view = fold(server, laid)`:

```ts
function fold(server: Split, laid: readonly Laid[]): Split {
  const top = laid.reduce((on, { op }) => { const r = applyOperation(on, op, { creator: false }); return r.ok ? r.split : on; }, server);
  return top === server ? server : { ...top, revision: server.revision, recentChanges: server.recentChanges };
}
```

Memoize the fold on `(server, laid)`. It replaces the plain `setLive` in the message handler (:101). `computeShares(split)` in the page (app/s/[id].tsx:152) then reads the view, so the dot, the split line and the footer Share all change in the same render.

## 2. How an op is applied, answered and dropped

- **act(op).** If the socket is not open, return `{ sent: false }` and lay nothing. Today's `send` refuses in that case too (client.ts:131), and the caller shows `say.connection.failed` at once, so the tap doesn't flash on and then back off. Otherwise mint the ref, append `{seq, ref, op}` to `laid` in the same `setSeen`, send the frame, and return the answer promise. Ref minting and the `Waiting` entry stay as they are (:132-151).
- **Answer `state` with ref r** (:100-103). In one `setSeen`, set `base = message.split` and remove from `laid` every entry with `seq <= seq(r)`. Answers come back in send order (operations.ts:923). Any older entry that is still laid therefore already had a `rejected` with ref null: a rate-limit refusal (worker/split-server.ts:129, :210) or an unreadable frame. Today those wait out `answerByMs` and then a reconnect. Settle them now with that refusal. That's a small bug fix that comes free with the layer.
- **Answer `unchanged` or `rejected` with ref r** (:104-107). Remove r (and any older entries, as above) from `laid` and leave the base alone. On a rejection the view snaps back to the server's Split. Rollback is just dropping the op, and nothing has to be inverted.
- **State with ref null** (another phone, the join snapshot or the photo). Replace the base and keep `laid`. The fold replays the pending ops on top, in order, the way the server will.
- **Close, deadline and disconnected** (:113-115, :141-147). An op leaves `laid` exactly when `settle` resolves its promise: `settle(ref)` also filters `laid`. The layer therefore lives exactly as long as the `Waiting` entry, and the existing `late` and `joined` logic (:69-72) still decides when that is. Recommended change: on a socket close, treat a laid entry like a `late` one. Keep it laid until the join state renders or the second deadline passes, then decide with `holds` (section 3). Today a close settles at once (:115) against the pre-join Split, so a claim that did land shows the failed bar (app/s/[id].tsx:239-241). With the layer it would also blink off and back on.

## 3. Reconciling and "did it land"

Add a core helper `holds(split, op): boolean` in src/core/operations.ts with an exhaustive switch and its own tests. It returns true when the op's intent is already true of `split`:
- claim and unclaim: claimer membership matches (:240 already returns `unchanged`)
- add: the id is present
- delete: the id is absent
- recordPayment and clearPayment: `paymentOf` equals the amount (:253-255)
- undo: the target's `undoneBy !== null`

A `disconnected` answer is a failure only when `!holds(server, op)`. This one rule replaces the per-call landed checks at app/s/[id].tsx:239-240, add.tsx:69, adjustment-sheet/index.tsx:111 and item-sheet/index.tsx:279.

**Conflict with another phone.** Phone B deletes the Item, or removes me as a claimer, while my claim is laid. The server decides by arrival order:
- If B's op arrived first, I get B's state with ref null. The fold replays my claim, `applyOperation` rejects it with `unknownItem` (:236), the fold skips it, and the line is gone at once. Then my `rejected` arrives and I show the bar.
- If mine arrived first, my answer and then B's broadcast follow in that order.

Either way every base is a prefix of the server's own history, so the view is never something the server can't reach.

## 4. Risks to money correctness and how this avoids them

| Risk | Avoided by |
|---|---|
| **Double apply when the echo arrives.** For one render, both the base and the layer hold the op. | (a) The base update and the removal from `laid` happen in one `setSeen`, keyed by ref. (b) Belt and braces: `Optimistic` admits only ops that are idempotent on replay. claim and unclaim set membership instead of toggling it (:239-240). recordPayment and clearPayment set an absolute amount. add is guarded by `duplicateId` (:550), delete by `unknownItem` and `unknownAdjustment` (:558, :661), and undo by `alreadyUndone` (:436). A join snapshot that already holds a timed-out op is safe for the same reason. `subtotalDelta` and `totalDelta` are deltas and are kept out by the type. Item `edit` patches stay in the item sheet's own layer (index.tsx:138-147) and are never put here. That avoids the sheet applying `sent` over a view that already has them. |
| **Order of several pending ops.** | The fold runs in `seq` order, the order the server applies them (one socket, FIFO, :923). Ops read the view when they are built. That matters for Add: `index: split.receipt.items.length` (new-item.ts:37) must count a pending Add, or two quick Adds land in swapped order. It also matters for `circleTap` (model.ts:99-101) and for `before` in onPaid (app/s/[id].tsx:371). |
| **A rejected op with later ops stacked on it.** | The server doesn't stack ops either. Each one applies to the server's state on arrival, and ops refer to each other only by id. The fold skips a rejected op and continues, which is exactly what the server will do. A claim on a rejected Add then fails with `unknownItem`, both in the fold and on the server. No op carries a value derived from an earlier op's result. The one exception is the next row. |
| **"I already paid" while a claim is pending.** The amount comes from the view's Share (app/s/[id].tsx:269). | If the claim succeeds, it lands before the payment (FIFO), so the amounts match. If it fails, the payment records the Share the person saw. The footer then shows "over" in warn ink (app/s/[id].tsx:478-481) and the bar says the claim failed. That outcome is honest and visible. **Ask the Opus advisor:** is that acceptable, or should "I already paid" wait until earlier laid ops have settled? |
| **A predicted revision reaches Undo or History.** History reverts `entry.revision` (history/index.tsx:53, describe.ts:31-39). Another phone's change can take revision base+1 first. A Revert sent with a guessed number would then undo someone else's change. | `fold` restores `revision` and `recentChanges` from the base. Undo uses only `answer.revision` from the server (client.ts:103, :17). |
| **A predicted rejection the server would not make, or the reverse.** | The fold uses `{creator: false}`. None of the `Optimistic` ops check the creator (only setPaymentHandles does, :258). Any other mismatch is corrected by the next `state`. |

## 5. Per call site

**Claim dot** (app/s/[id].tsx:233-244). Use `const r = act({...circleTap(item, person)[0], by: me})`:
- If `!r.sent`, set `bar = say.connection.failed`.
- Otherwise, on a failed answer with `!holds(live.server, op)`, show `failedCopy(answer, say.saveFailed)` in the bar. The existing `failedCopy` keeps its wording per reason.

Drop the `for` loop and the await: `circleTap` returns one op. The `item` comes from the view, so a second fast tap reads the claim and sends `unclaim`. Today the second tap re-sends `claim` and gets `unchanged` (operations.ts:240), so the tap is lost. It doesn't double-claim.

**Who had it toggle** (item-sheet/index.tsx:262-265). Keep `flush()` first, so the edit frame precedes the claim on the wire. Then `act(...)`. `had` (:260) already reads `item`, which is built from `current`, which is now the view. Today the answer is ignored entirely (:264), so a failed toggle has no rollback and no message. Route failures to `onNote`.

**Delete Item** (:275-292):
1. `setLeavingFrom(seen)` and keep the `flushRef` no-op (:290). The sheet keeps its picture, and the "removed elsewhere" path (:155-163) stays off because `leavingFrom` is set in the same batch.
2. `act(delete)` and `onClose()` at once.
3. On ok with a revision, call `onDeleted({name, revision})` (:291), which shows the Undo bar (app/s/[id].tsx:315-326).
4. On failure, the line comes back. Show the bar with `say.saveFailed`.

Don't reopen the sheet: its edits were already flushed or dropped.

**Delete Adjustment** (adjustment-sheet/index.tsx:105-114): same as Delete Item.

**Add** (add.tsx:56-72): close at once. On a failure where `!holds`, show the bar with the `problemText` and a **Try again** action that calls `act(sameOp)` again. The ids are minted once (:39), so a retry can't add the line twice. That fixes the "typed line lost" worry without reopening the sheet. Validation is already local (:59-66), so a server refusal is rare: the cap, size, rate limit or the connection.

**I already paid** (app/s/[id].tsx:369-384):
1. `act(recordPayment)` and `closeOverlay()` at once.
2. Today's Undo for a payment is an absolute `recordPayment`/`clearPayment` back to `before` (:378), not a revision undo (payments are `paymentNotRevertible`, :439). Show the "Marked $X paid · Undo" bar when the answer is ok. Read `before` from the view.
3. On failure, show the bar. `payerOnly` maps to `say.payerOnly` (:273). The Pay sheet's `payProblem` text no longer has an open sheet to show in.

**Undo on the bar** (:320-323): use `act({type: "undo", revision})` so the line comes back at once. A revision from the server is stable, so it's safe to lay it.

## 6. Checks on the brief

- Item 2 says "the item sheet already does this". **Partly wrong.** The sheet lays only its own typed edits (`sent` + `pending`, item-sheet/index.tsx:138-147) over the Split, for its own preview. It doesn't lay claims (the toggle at :262-265 sends and ignores the answer), and the card and footer never see its layer.
- Item 2 says "a fast second tap resends claim". **True, but it's not a double claim.** The server answers `unchanged` (operations.ts:240), so the second tap is silently lost.
- Item 2 line numbers: claim is at app/s/[id].tsx:233-244 (brief: 236-247), and the dot is at receipt-card.tsx:423 and :437 (brief: 422, 436). model.ts:99-101 and item-sheet :262-265 are right.
- Item 3: the item sheet's close and leave are at :267-285 and delete at :287-292 (brief: 270-281). adjustment-sheet :109 is right. add.tsx's `add` is at :56-72 (brief: 57-79; :79 is the `pointerEvents` hold). onPaid is at app/s/[id].tsx:369-384 (brief: 370-385). B2 decision 6 is real: docs/design/b2/README.md:20, and the delete Undo spec is at docs/plans/splitwith-b2.md:550.
- Not in the brief: rate-limit refusals carry ref null (split-server.ts:129, :210). Today they leave the op waiting until the deadline and a reconnect. The layer must drop them on the next answer (section 2), or a refused claim stays lit for `answerByMs`.

## 7. Seams to test (red on main, green after)

- `fold` and `holds` in core, unit tested:
  - claim then unclaim folds to unclaimed
  - an echo state plus a still-laid op gives the same Shares
  - a rejected add followed by a claim on it skips both
  - the predicted revision and recentChanges equal the server's
- src/live/client.test.ts, with a fake socket:
  - a ref'd state drops the op in the same render
  - a ref-null rejection is dropped on the next answer
  - a ref-null state from another phone rebases the laid ops
- e2e/claim.spec.ts, with the socket delayed by about 500 ms:
  - two fast taps leave the dot off (fails on main)
  - Delete closes the sheet before the answer, and Undo appears after it

import { applyOperation } from "../../core/operations";
import { sameMoney } from "../../core/shares";
import type { Change, ItemId, ItemSplit, ParticipantId, Split, Write } from "../../core/split";
import { groupedAmount, money } from "../../core/currency";
import { splitCopy as say } from "../split-copy";
import { nameParts } from "../split-view/model";

export type Entry = {
  readonly revision: number;
  readonly lead: string;
  readonly before?: string;
  readonly after?: string;
  readonly more: number;
  readonly sentAs: ParticipantId | null;
  readonly name: string | null;
  /** Whether the row says who made the change; it does not when that person is already the subject, as in "Samantha paid $58.28". */
  readonly byline: boolean;
  readonly at: number | undefined;
  readonly reverted: boolean;
  readonly revertible: boolean;
};

type Removal = Extract<Write, { kind: "participant"; removed: unknown }>;
type Shown = Extract<Write, { kind: "item" | "split" | "adjustment" | "totals" | "payment" }> | Removal;

const isRemoval = (write: Change["writes"][number]): write is Removal => write.kind === "participant" && "removed" in write;

const shown = (write: Change["writes"][number]): write is Shown =>
  write.kind === "item" || write.kind === "split" || write.kind === "adjustment" || write.kind === "totals" || write.kind === "payment" || isRemoval(write);

/** A change whose only write is a new way of splitting one Item. */
type Switch = { readonly change: Change; readonly id: ItemId; readonly split: readonly [before: ItemSplit, after: ItemSplit] };

function switchOf(change: Change): Switch | null {
  if (change.undoes !== null || change.writes.length !== 1) return null;
  const [write] = change.writes;
  if (write.kind !== "item" || !("edit" in write) || !write.edit.split || Object.keys(write.edit).length !== 1) return null;
  return { change, id: write.id, split: write.edit.split };
}

type Run = { readonly change: Change } | { readonly switches: Switch[] };

/**
 * Back-to-back switches of one Item by one person read as one entry from the first one's before to the last one's after. Its Revert targets the first,
 * whose inverse puts the Item's split back as it was before the first, so it undoes the whole run. A switch reverted on its own starts a new run.
 */
function runs(changes: readonly Change[]): readonly Run[] {
  const out: Run[] = [];
  for (const change of changes) {
    const next = switchOf(change);
    const last = out.at(-1);
    const tail = last && "switches" in last ? last.switches[last.switches.length - 1] : undefined;
    if (next && last && "switches" in last && tail && tail.id === next.id && tail.change.by === change.by && change.undoneBy === null) last.switches.push(next);
    else out.push(next ? { switches: [next] } : { change });
  }
  return out;
}

const priceOf = (split: Split, id: ItemId) => split.receipt.items.find((item) => item.id === id)?.price;

/** A switch that leaves everyone's cents where they were, such as evenly to 1 share each, is not worth a line. An Item since deleted keeps its line. */
function movesMoney(split: Split, id: ItemId, before: ItemSplit, after: ItemSplit): boolean {
  const price = priceOf(split, id);
  return price === undefined || !sameMoney(price, before, after);
}

const idle = (split: Split, write: Shown) => write.kind === "item" && "edit" in write && write.edit.split !== undefined && Object.keys(write.edit).length === 1 && !movesMoney(split, write.id, ...write.edit.split);

export function historyOf(split: Split): Entry[] {
  return runs(split.recentChanges)
    .flatMap((run): Entry[] => {
      if ("switches" in run) {
        const [first, last] = [run.switches[0], run.switches[run.switches.length - 1]];
        const [before, after] = [first.split[0], last.split[1]];
        if (!movesMoney(split, first.id, before, after)) return [];
        return [entry(split, first.change, [{ kind: "item", id: first.id, edit: { split: [before, after] } }], last.change.at)];
      }
      const { change } = run;
      const writes = change.writes.filter(shown).filter((write) => !idle(split, write));
      return change.undoes === null && writes.length > 0 ? [entry(split, change, writes, change.at)] : [];
    })
    .reverse();
}

function entry(split: Split, change: Change, writes: readonly Shown[], at: number | undefined): Entry {
  // A removal's own claim and payment writes are part of it, not more changes.
  const removal = writes.find(isRemoval);
  const lead = removal ?? writes.find((write) => write.kind !== "totals") ?? writes[0];
  return {
    revision: change.revision,
    ...describe(lead, split),
    more: removal ? 0 : writes.filter((write) => write.kind !== "totals" && write !== lead).length,
    sentAs: change.by,
    name: split.participants.find(({ id }) => id === change.by)?.name ?? null,
    byline: !(lead.kind === "payment" && lead.participantId === change.by),
    at,
    reverted: change.undoneBy !== null,
    revertible: !change.writes.some((write) => (write.kind === "payment" && !removal) || write.kind === "perUnit"),
  };
}

function describe(write: Shown, split: Split): Pick<Entry, "lead" | "before" | "after"> {
  switch (write.kind) {
    case "item":
    case "adjustment": {
      if ("added" in write) return { lead: `Added ${write.added.name}` };
      if ("removed" in write) return { lead: say.deleted(write.removed.name) };
      const rows: readonly { readonly id: string; readonly name: string }[] = write.kind === "item" ? split.receipt.items : split.receipt.adjustments;
      const name = rows.find(({ id }) => id === write.id)?.name ?? "An item";
      const edit = write.edit;
      if ("name" in edit && edit.name && "detail" in edit && edit.detail && !edit.detail[0]) {
        const [before, after] = [nameParts({ name: edit.name[0], detail: undefined }), edit.name[1]];
        if (before[1] !== null && after === before[0] && edit.detail[1]) return { lead: name, before: before[1], after: edit.detail[1] };
      }
      if ("name" in edit && edit.name) return { lead: "", before: edit.name[0], after: edit.name[1] };
      if ("quantity" in edit && edit.quantity) return { lead: name, before: `×${edit.quantity[0]}`, after: `×${edit.quantity[1]}` };
      if ("price" in edit && edit.price) return { lead: name, before: groupedAmount(edit.price[0], split.currency), after: groupedAmount(edit.price[1], split.currency) };
      if ("detail" in edit && edit.detail) {
        const [before = "", after = ""] = edit.detail;
        if (!before) return { lead: `Added "${after}" to ${name}` };
        if (!after) return { lead: `Removed "${before}" from ${name}` };
        return { lead: name, before, after };
      }
      if ("amount" in edit && edit.amount) return { lead: name, before: groupedAmount(edit.amount[0], split.currency), after: groupedAmount(edit.amount[1], split.currency) };
      if ("split" in edit && edit.split) {
        const [before, after] = edit.split;
        return before.by === after.by ? { lead: `Changed how ${name} is split` } : { lead: `${name} split`, before: splitWord(before), after: splitWord(after) };
      }
      return { lead: name };
    }
    case "split":
      return { lead: `Split ${split.receipt.items.find(({ id }) => id === write.id)?.name ?? "An item"} into ${write.line.quantity}` };
    case "totals": {
      // A Subtotal set by hand moves only the Subtotal, so the line names it rather than a Total that stayed put.
      const [word, delta] = write.totalDelta === 0 ? ["Subtotal", write.subtotalDelta] : ["Total", write.totalDelta];
      return { lead: delta < 0 ? `${word} down ${money(-delta, split.currency)}` : `${word} up ${money(delta, split.currency)}` };
    }
    case "participant":
      return { lead: say.removedPerson(write.removed.name) };
    case "payment": {
      const payer = split.participants.find(({ id }) => id === write.participantId)?.name ?? "Someone";
      return write.after === null ? { lead: `${payer} marked unpaid` } : { lead: `${payer} paid ${money(write.after, split.currency)}` };
    }
  }
}

export function splitWord(split: ItemSplit): string {
  if (split.by === "even") return "evenly";
  if (split.by === "amount") return "by amount";
  return "by shares";
}

export function whenText(at: number | undefined, now: number): string | null {
  if (at === undefined) return null;
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return say.justNow;
  if (minutes < 60) return say.minutesAgo(minutes);
  return new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * Whether Restore would change the receipt: false while the Items, charges and totals already match the scan.
 * A Split typed in by hand has no scan to go back to, and restoring its empty original would delete every Item.
 */
export function restoreChanges(split: Split): boolean {
  if (split.original === undefined || split.original.items.length === 0) return false;
  const result = applyOperation(split, { by: null, type: "restoreReceipt" }, { creator: false });
  return result.ok && result.changed;
}

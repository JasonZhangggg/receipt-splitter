import { applyOperation } from "../../core/operations";
import type { Change, ItemSplit, ParticipantId, Split, Write } from "../../core/split";
import { groupedAmount, money } from "../../draft";
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

export function historyOf(split: Split): Entry[] {
  return split.recentChanges
    .filter((change) => change.undoes === null && change.writes.some(shown))
    .map((change) => {
      const writes = change.writes.filter(shown);
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
        at: change.at,
        reverted: change.undoneBy !== null,
        revertible: !change.writes.some((write) => (write.kind === "payment" && !removal) || write.kind === "perUnit"),
      };
    })
    .reverse();
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
      if ("price" in edit && edit.price) return { lead: name, before: groupedAmount(edit.price[0]), after: groupedAmount(edit.price[1]) };
      if ("detail" in edit && edit.detail) {
        const [before = "", after = ""] = edit.detail;
        if (!before) return { lead: `Added "${after}" to ${name}` };
        if (!after) return { lead: `Removed "${before}" from ${name}` };
        return { lead: name, before, after };
      }
      if ("amount" in edit && edit.amount) return { lead: name, before: groupedAmount(edit.amount[0]), after: groupedAmount(edit.amount[1]) };
      if ("split" in edit && edit.split) {
        const [before, after] = edit.split;
        return { lead: `${name} split`, before: splitWord(before), after: splitWord(after) };
      }
      return { lead: name };
    }
    case "split":
      return { lead: `Split ${split.receipt.items.find(({ id }) => id === write.id)?.name ?? "An item"} into ${write.line.quantity}` };
    case "totals":
      return { lead: write.totalDelta < 0 ? `Total down ${money(-write.totalDelta)}` : `Total up ${money(write.totalDelta)}` };
    case "participant":
      return { lead: say.removedPerson(write.removed.name) };
    case "payment": {
      const payer = split.participants.find(({ id }) => id === write.participantId)?.name ?? "Someone";
      return write.after === null ? { lead: `${payer} marked unpaid` } : { lead: `${payer} paid ${money(write.after)}` };
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

/** Whether Restore would change the receipt: false while the Items, charges and totals already match the scan. */
export function restoreChanges(split: Split): boolean {
  if (split.original === undefined) return false;
  const result = applyOperation(split, { by: null, type: "restoreReceipt" }, { creator: false });
  return result.ok && result.changed;
}

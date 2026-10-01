import type { Change, ItemSplit, ParticipantId, Split, Write } from "../../core/split";
import { plainAmount } from "../../draft";
import { splitCopy as say } from "../split-copy";
import { ratio } from "../split-view/model";

export type Entry = {
  readonly revision: number;
  readonly lead: string;
  readonly before?: string;
  readonly after?: string;
  readonly more: number;
  readonly sentAs: ParticipantId | null;
  readonly name: string | null;
  readonly at: number | undefined;
  readonly reverted: boolean;
  readonly revertible: boolean;
};

type Shown = Extract<Write, { kind: "item" | "adjustment" | "totals" | "payment" }>;

const shown = (write: Change["writes"][number]): write is Shown => write.kind === "item" || write.kind === "adjustment" || write.kind === "totals" || write.kind === "payment";

export function historyOf(split: Split): Entry[] {
  return split.recentChanges
    .filter((change) => change.undoes === null && change.writes.some(shown))
    .map((change) => {
      const writes = change.writes.filter(shown);
      const lead = writes.find((write) => write.kind !== "totals") ?? writes[0];
      const words = describe(lead, split);
      return {
        revision: change.revision,
        ...words,
        more: writes.filter((write) => write.kind !== "totals" && write !== lead).length,
        sentAs: change.by,
        name: split.participants.find(({ id }) => id === change.by)?.name ?? null,
        at: change.at,
        reverted: change.undoneBy !== null,
        revertible: !writes.some((write) => write.kind === "payment"),
      };
    })
    .reverse();
}

function describe(write: Shown, split: Split): Pick<Entry, "lead" | "before" | "after"> {
  switch (write.kind) {
    case "item":
    case "adjustment": {
      if ("added" in write) return { lead: `Added ${write.added.name}` };
      if ("removed" in write) return { lead: `Removed ${write.removed.name}` };
      const rows: readonly { readonly id: string; readonly name: string }[] = write.kind === "item" ? split.receipt.items : split.receipt.adjustments;
      const name = rows.find(({ id }) => id === write.id)?.name ?? "An item";
      const edit = write.edit;
      if ("name" in edit && edit.name) return { lead: "", before: edit.name[0], after: edit.name[1] };
      if ("price" in edit && edit.price) return { lead: name, before: plainAmount(edit.price[0]), after: plainAmount(edit.price[1]) };
      if ("amount" in edit && edit.amount) return { lead: name, before: plainAmount(edit.amount[0]), after: plainAmount(edit.amount[1]) };
      if ("split" in edit && edit.split) {
        const [before, after] = edit.split;
        if (before.units.length !== after.units.length) return { lead: name, before: `×${before.units.length}`, after: `×${after.units.length}` };
        const order = split.participants.map(({ id }) => id);
        return { lead: `${name} split`, before: splitWord(before, order), after: splitWord(after, order) };
      }
      return { lead: name };
    }
    case "totals":
      return { lead: write.totalDelta < 0 ? `Total down $${plainAmount(-write.totalDelta)}` : `Total up $${plainAmount(write.totalDelta)}` };
    case "payment": {
      const payer = split.participants.find(({ id }) => id === write.participantId)?.name ?? "Someone";
      return write.after === null ? { lead: `${payer} marked unpaid` } : { lead: `${payer} paid $${plainAmount(write.after)}` };
    }
  }
}

export function splitWord(split: ItemSplit, order: readonly ParticipantId[]): string {
  if (split.by === "even") return "evenly";
  if (split.by === "amount") return "by amount";
  const [first] = split.units;
  return first.length > 1 ? ratio(first, order) : "by shares";
}

export function whenText(at: number | undefined, now: number): string | null {
  if (at === undefined) return null;
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return say.justNow;
  if (minutes < 60) return say.minutesAgo(minutes);
  return new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

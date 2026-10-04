import type { Cents, Price } from "./money";

declare const idBrand: unique symbol;
type IdKind = "SplitId" | "ParticipantId" | "ItemId" | "AdjustmentId" | "DeviceId";
type Id<Kind extends IdKind> = string & { readonly [idBrand]: Kind };

export type SplitId = Id<"SplitId">;
export type ParticipantId = Id<"ParticipantId">;
export type ItemId = Id<"ItemId">;
export type AdjustmentId = Id<"AdjustmentId">;
export type DeviceId = Id<"DeviceId">;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;

export function isId<Kind extends IdKind>(value: unknown): value is Id<Kind> {
  return typeof value === "string" && ID_PATTERN.test(value) && value !== "__proto__";
}

declare const mintedBrand: unique symbol;
export type MintedSplitId = SplitId & { readonly [mintedBrand]: true };

const MIN_MINTED_ID_LENGTH = 16;

export function isMintedSplitId(value: string): value is MintedSplitId {
  return value.length >= MIN_MINTED_ID_LENGTH && isId<"SplitId">(value);
}

export const SPLIT_ID_LENGTH = 22;

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export function randomId(length: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (byte) => ID_ALPHABET[byte & 63]).join("");
}

export function isRoutableSplitId(value: string): value is MintedSplitId {
  return value.length === SPLIT_ID_LENGTH && isMintedSplitId(value);
}

function id<Kind extends IdKind>(value: string): Id<Kind> {
  if (!isId<Kind>(value)) throw new RangeError(`${JSON.stringify(value)} is not 1 to 24 letters, digits, "_", or "-", or is "__proto__"`);
  return value;
}

export const participantId = (value: string) => id<"ParticipantId">(value);
export const itemId = (value: string) => id<"ItemId">(value);
export const adjustmentId = (value: string) => id<"AdjustmentId">(value);
export const deviceId = (value: string) => id<"DeviceId">(value);

export type NonEmpty<T> = readonly [T, ...T[]];

export type ItemRow = {
  readonly id: ItemId;
  readonly name: string;
  readonly price: Price;
  /** Text under the name, such as a size, a modifier, or "$2.00 off". Absent when the Item has none. */
  readonly detail?: string;
};

/** An Item as read from the receipt. The price covers every unit. */
export type Item = ItemRow & { readonly quantity?: number };

export const RECEIPT_LEVEL_KINDS = ["tax", "tip", "serviceCharge", "discount"] as const;

export const ADJUSTMENT_KINDS = [...RECEIPT_LEVEL_KINDS, "bundleDiscount"] as const;

export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

export type ReceiptLevelKind = (typeof RECEIPT_LEVEL_KINDS)[number];

export type Bundle = {
  readonly name: string;
  readonly items: NonEmpty<ItemId>;
};

export type Adjustment =
  | { readonly id: AdjustmentId; readonly kind: ReceiptLevelKind; readonly name: string; readonly amount: Cents }
  | { readonly id: AdjustmentId; readonly kind: "bundleDiscount"; readonly name: string; readonly amount: Cents; readonly bundle: Bundle };

export type ReceiptLevelAdjustment = Extract<Adjustment, { readonly kind: ReceiptLevelKind }>;

export type Receipt<I extends Item = Item> = {
  readonly items: NonEmpty<I>;
  readonly adjustments: readonly Adjustment[];
  readonly subtotal: Cents;
  readonly total: Cents;
};

export type Part<Value extends number> = readonly [participantId: ParticipantId, value: Value];

/**
 * How an Item divides: who had the whole line, sorted by id, with their shares or cents.
 * The one claim set is stored as a one-entry `units` list because Workers before quantity lines read `units` as a list.
 */
export type ItemSplit =
  | { readonly by: "even"; readonly units: readonly [readonly ParticipantId[]] }
  | { readonly by: "shares"; readonly units: readonly [readonly Part<number>[]] }
  | { readonly by: "amount"; readonly units: readonly [readonly Part<Cents>[]] };

export const SPLIT_MODES = ["even", "shares", "amount"] as const satisfies readonly ItemSplit["by"][];

export type SplitMode = (typeof SPLIT_MODES)[number];

/** A stored Item leaves out a quantity of 1. */
export type SplitItem = Item & { readonly split: ItemSplit };

export type NamePick = { readonly participantId: ParticipantId; readonly device: DeviceId };

export type Participant = {
  readonly id: ParticipantId;
  readonly name: string;
};

export type Claim = {
  readonly itemId: ItemId;
  readonly participantId: ParticipantId;
};

export type Payment = {
  readonly participantId: ParticipantId;
  readonly amount: Cents;
};

export const PAYMENT_SERVICES = ["venmo", "cashApp", "paypal", "zelle"] as const;

export type PaymentService = (typeof PAYMENT_SERVICES)[number];

export type PaymentHandle = {
  readonly service: PaymentService;
  readonly handle: string;
};

export type ItemFields = Omit<SplitItem, "id">;
export type AdjustmentFields = Adjustment extends infer Row ? (Row extends Adjustment ? Omit<Row, "id"> : never) : never;
export type ParticipantFields = Omit<Participant, "id">;

export type Placed<Fields> = Fields & { readonly index: number };

/**
 * An optional field's pair holds plain values, so a quantity pair reads 1 for a line without one.
 * An Item's `detail` pair writes "" for no detail, so the pair survives JSON.
 */
export type Edit<Fields> = { readonly [Key in keyof Fields]?: readonly [before: Required<Fields>[Key], after: Required<Fields>[Key]] };

export type Presence<RowId, Fields> =
  | { readonly id: RowId; readonly added: Placed<Fields> }
  | { readonly id: RowId; readonly removed: Placed<Fields> };

export type RowWrite<RowId, Fields> = Presence<RowId, Fields> | { readonly id: RowId; readonly edit: Edit<Fields> };

/** What Split changes on a quantity line, and what Revert gives it back. */
export type QuantityLine = { readonly quantity: number; readonly price: Price; readonly split: ItemSplit };

export type Write =
  | ({ readonly kind: "item" } & RowWrite<ItemId, ItemFields>)
  /** The line `id`, holding `line`, becomes one-unit rows: itself, then `ids`. The rows follow from `line`, so the write stays small at any quantity. */
  | { readonly kind: "split"; readonly id: ItemId; readonly ids: NonEmpty<ItemId>; readonly line: QuantityLine }
  /** The rows `ids` fold back into the row `id`, which takes `line`. */
  | { readonly kind: "unsplit"; readonly id: ItemId; readonly ids: NonEmpty<ItemId>; readonly line: QuantityLine }
  | ({ readonly kind: "adjustment" } & RowWrite<AdjustmentId, AdjustmentFields>)
  | ({ readonly kind: "participant" } & Presence<ParticipantId, ParticipantFields>)
  | { readonly kind: "totals"; readonly subtotalDelta: Cents; readonly totalDelta: Cents }
  | {
      readonly kind: "payment";
      readonly participantId: ParticipantId;
      readonly before: Cents | null;
      readonly after: Cents | null;
    };

export type LegacyWrite =
  | { readonly kind: "joined"; readonly participantId: ParticipantId; readonly joined: boolean }
  | {
      readonly kind: "claims";
      readonly itemIds: NonEmpty<ItemId>;
      readonly participantIds: NonEmpty<ParticipantId>;
      readonly claimed: boolean;
    };

export type Change = {
  readonly revision: number;
  readonly by: ParticipantId | null;
  readonly undoes: number | null;
  readonly undoneBy: number | null;
  readonly writes: NonEmpty<Write | LegacyWrite>;
  readonly at?: number;
};

/** Version 2 adds Bundles, version 3 adds an Item's detail, and version 4 stores a quantity line as one claim set. A Split is stored at the lowest version that holds it, so older Workers keep reading it. */
export type SchemaVersion = 1 | 2 | 3 | 4;

export function storedVersion({ receipt, original, recentChanges }: Pick<Split, "receipt" | "original" | "recentChanges">): SchemaVersion {
  const writes = recentChanges.flatMap((change) => change.writes);
  const writesQuantity = (write: Write | LegacyWrite) =>
    write.kind === "split" || write.kind === "unsplit" || (write.kind === "item" && ("edit" in write ? "quantity" in write.edit : ("added" in write ? write.added : write.removed).quantity !== undefined));
  if (receipt.items.some(({ quantity }) => quantity !== undefined) || writes.some(writesQuantity)) return 4;
  const detailed = (items: readonly ItemRow[]) => items.some((item) => item.detail !== undefined);
  const writesDetail = (write: Write | LegacyWrite) => write.kind === "item" && ("edit" in write ? "detail" in write.edit : ("added" in write ? write.added : write.removed).detail !== undefined);
  if (detailed(receipt.items) || detailed(original?.items ?? []) || writes.some(writesDetail)) return 3;
  const bundled = (adjustments: readonly Adjustment[]) => adjustments.some(({ kind }) => kind === "bundleDiscount");
  const writesBundle = (write: Write | LegacyWrite) =>
    write.kind === "adjustment" && ("edit" in write ? "bundle" in write.edit : ("added" in write ? write.added : write.removed).kind === "bundleDiscount");
  return bundled(receipt.adjustments) || bundled(original?.adjustments ?? []) || writes.some(writesBundle) ? 2 : 1;
}

export type Split = {
  readonly schemaVersion: SchemaVersion;
  readonly id: SplitId;
  readonly currency: "USD";
  readonly receipt: Receipt<SplitItem>;
  readonly original?: Receipt;
  readonly participants: readonly [host: Participant, ...others: Participant[]];
  /** Sorted by id, one per picked name. */
  readonly picks: readonly NamePick[];
  readonly payments: readonly Payment[];
  readonly paymentHandles: NonEmpty<PaymentHandle>;
  readonly revision: number;
  readonly recentChanges: readonly Change[];
};

export const SPLIT_BYTE_BUDGET = 32 * 1024;

export function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

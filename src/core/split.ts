import type { Cents, Price } from "./money";

declare const idBrand: unique symbol;
type IdKind = "SplitId" | "ParticipantId" | "ItemId" | "AdjustmentId" | "DeviceId";
type Id<Kind extends IdKind> = string & { readonly [idBrand]: Kind };

export type SplitId = Id<"SplitId">;
export type ParticipantId = Id<"ParticipantId">;
export type ItemId = Id<"ItemId">;
export type AdjustmentId = Id<"AdjustmentId">;
export type DeviceId = Id<"DeviceId">;

export const MAX_ID_LENGTH = 24;
const ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{1,${MAX_ID_LENGTH}}$`);

export function isId<Kind extends IdKind>(value: unknown): value is Id<Kind> {
  return typeof value === "string" && ID_PATTERN.test(value) && value !== "__proto__";
}

declare const mintedBrand: unique symbol;
export type MintedSplitId = SplitId & { readonly [mintedBrand]: true };

const MIN_MINTED_ID_LENGTH = 16;

export function isMintedSplitId(value: string): value is MintedSplitId {
  return value.length >= MIN_MINTED_ID_LENGTH && isId<"SplitId">(value);
}

/** Ids minted before signed ids are 22 random characters. A signed id is 16 random characters and an 8-character tag the Worker checks (worker/split-id.ts). */
export const LEGACY_SPLIT_ID_LENGTH = 22;
export const SIGNED_SPLIT_ID_LENGTH = 24;

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export function randomId(length: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (byte) => ID_ALPHABET[byte & 63]).join("");
}

export function isRoutableSplitId(value: string): value is MintedSplitId {
  return (value.length === LEGACY_SPLIT_ID_LENGTH || value.length === SIGNED_SPLIT_ID_LENGTH) && isMintedSplitId(value);
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
  /** Empty only for a Split whose Host adds every Item by hand. */
  readonly items: readonly I[];
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

/** A person's own part of one Item: their share count, their cents, or 0 for an even claim, with the mode it was in. */
export type ClaimPart = readonly [itemId: ItemId, by: SplitMode, value: number];

export type Write =
  | ({ readonly kind: "item" } & RowWrite<ItemId, ItemFields>)
  /**
   * Takes one person off each listed Item (`claimed` false), or puts them back (`claimed` true). It names only their own part, so a removal stays small
   * at any group size, and putting them back leaves every other claimer's values as they are now.
   */
  | { readonly kind: "claimParts"; readonly participantId: ParticipantId; readonly parts: NonEmpty<ClaimPart>; readonly claimed: boolean }
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
  /** Marks an old change to a line that a release before quantity lines stored per unit and that no longer reads as it did, so its Revert answers conflict. */
  | { readonly kind: "perUnit"; readonly id: ItemId }
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

/** Version 2 adds Bundles, version 3 adds an Item's detail, and version 4 stores a quantity line as one claim set. Every write stores version 4. */
export type SchemaVersion = 1 | 2 | 3 | 4;

export type Split = {
  readonly schemaVersion: 4;
  readonly id: SplitId;
  readonly currency: "USD";
  /** The business the receipt came from, as the scan read it and the Host kept it. Splits made before it was kept, and Splits made by hand, have none. */
  readonly place?: string;
  readonly receipt: Receipt<SplitItem>;
  readonly original?: Receipt;
  readonly participants: readonly [host: Participant, ...others: Participant[]];
  /** Sorted by id, one per picked name. */
  readonly picks: readonly NamePick[];
  readonly payments: readonly Payment[];
  readonly paymentHandles: readonly PaymentHandle[];
  readonly revision: number;
  readonly recentChanges: readonly Change[];
};

export const SPLIT_BYTE_BUDGET = 32 * 1024;

export function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

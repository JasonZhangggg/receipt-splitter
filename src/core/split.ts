import type { Cents, Price } from "./money";

declare const idBrand: unique symbol;
type Id<Name extends string> = string & { readonly [idBrand]: Name };

export type SplitId = Id<"SplitId">;
export type ParticipantId = Id<"ParticipantId">;
export type ItemId = Id<"ItemId">;
export type AdjustmentId = Id<"AdjustmentId">;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,24}$/;

export function isId<T extends Id<string>>(value: unknown): value is T {
  return typeof value === "string" && ID_PATTERN.test(value) && value !== "__proto__";
}

declare const mintedBrand: unique symbol;
export type MintedSplitId = SplitId & { readonly [mintedBrand]: true };

const MIN_MINTED_ID_LENGTH = 16;

export function isMintedSplitId(value: string): value is MintedSplitId {
  return value.length >= MIN_MINTED_ID_LENGTH && isId<SplitId>(value);
}

function id<T extends Id<string>>(value: string): T {
  if (!isId<T>(value)) throw new RangeError(`${JSON.stringify(value)} is not 1 to 24 letters, digits, "_", or "-", or is "__proto__"`);
  return value;
}

export const participantId = (value: string) => id<ParticipantId>(value);
export const itemId = (value: string) => id<ItemId>(value);
export const adjustmentId = (value: string) => id<AdjustmentId>(value);

export type NonEmpty<T> = readonly [T, ...T[]];

export type Item = {
  readonly id: ItemId;
  readonly name: string;
  readonly price: Price;
};

export const ADJUSTMENT_KINDS = ["tax", "tip", "serviceCharge", "discount"] as const;

export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

export type Adjustment = {
  readonly id: AdjustmentId;
  readonly kind: AdjustmentKind;
  readonly name: string;
  readonly amount: Cents;
};

export type Receipt<I extends Item = Item> = {
  readonly items: NonEmpty<I>;
  readonly adjustments: readonly Adjustment[];
  readonly subtotal: Cents;
  readonly total: Cents;
};

export type SplitItem = Item & { readonly claimedBy: readonly ParticipantId[] };

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
export type AdjustmentFields = Omit<Adjustment, "id">;
export type ParticipantFields = Omit<Participant, "id">;

export type Placed<Fields> = Fields & { readonly index: number };

export type Edit<Fields> = { readonly [Key in keyof Fields]?: readonly [before: Fields[Key], after: Fields[Key]] };

export type Presence<RowId, Fields> =
  | { readonly id: RowId; readonly added: Placed<Fields> }
  | { readonly id: RowId; readonly removed: Placed<Fields> };

export type RowWrite<RowId, Fields, Editable extends keyof Fields> =
  | Presence<RowId, Fields>
  | { readonly id: RowId; readonly edit: Edit<Pick<Fields, Editable>> };

export type Write =
  | ({ readonly kind: "item" } & RowWrite<ItemId, ItemFields, "name" | "price">)
  | ({ readonly kind: "adjustment" } & RowWrite<AdjustmentId, AdjustmentFields, keyof AdjustmentFields>)
  | ({ readonly kind: "participant" } & Presence<ParticipantId, ParticipantFields>)
  | { readonly kind: "totals"; readonly subtotalDelta: Cents; readonly totalDelta: Cents }
  | {
      readonly kind: "payment";
      readonly participantId: ParticipantId;
      readonly before: Cents | null;
      readonly after: Cents | null;
    }
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
  readonly writes: NonEmpty<Write>;
};

export type Split = {
  readonly schemaVersion: 1;
  readonly id: SplitId;
  readonly currency: "USD";
  readonly receipt: Receipt<SplitItem>;
  readonly participants: readonly [host: Participant, ...others: Participant[]];
  readonly payments: readonly Payment[];
  readonly paymentHandles: NonEmpty<PaymentHandle>;
  readonly revision: number;
  readonly recentChanges: readonly Change[];
};

export const SPLIT_BYTE_BUDGET = 32 * 1024;

export function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

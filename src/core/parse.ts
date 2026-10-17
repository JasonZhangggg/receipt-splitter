import { fromLegacy, type LegacyChange, type LegacyItemSplit, type LegacyItemWrite, type LegacySplit } from "./legacy";
import { isCents, isPrice } from "./money";
import { pickDevice } from "./pick-device";
import {
  MAX_ADJUSTMENTS,
  MAX_ITEMS,
  MAX_PARTICIPANTS,
  MAX_QUANTITY,
  MAX_STORED_ITEMS,
  MAX_STORED_WRITES_PER_CHANGE,
  MAX_WRITES_PER_CHANGE,
  RECENT_CHANGES_LIMIT,
  checkSplit,
  createSplit,
  type AdjustmentPatch,
  type ClientMessage,
  type CreateSplitRequest,
  type ItemPatch,
  type NewSplit,
  type Operation,
  type Rejected,
} from "./operations";
import {
  ADJUSTMENT_KINDS,
  PAYMENT_SERVICES,
  RECEIPT_LEVEL_KINDS,
  SPLIT_MODES,
  isId,
  type Change,
  type ClaimPart,
  type ItemSplit,
  type LegacyWrite,
  type MintedSplitId,
  type NamePick,
  type NonEmpty,
  type Part,
  type SchemaVersion,
  type Split,
  type Write,
} from "./split";

export function parseOperation(input: unknown): { readonly ok: true; readonly op: Operation } | Rejected {
  const parsed = parse(operation, input);
  return parsed.ok ? { ok: true, op: parsed.value } : parsed;
}

export function parseSplit(input: unknown): { readonly ok: true; readonly split: Split } | Rejected {
  const parsed = parse(split, input);
  if (!parsed.ok) return parsed;
  const rejection = checkSplit(parsed.value);
  if (rejection) return { ok: false, rejection };
  const { id, picks } = parsed.value;
  return { ok: true, split: { ...parsed.value, picks: picks.map((held) => ({ ...held, device: pickDevice(held.device, id) })) } };
}

/** A ClientMessage, or its rejection with the ref to answer under, which is null when the ref itself is unreadable. */
export function parseClientMessage(input: unknown): { readonly ok: true; readonly message: ClientMessage } | (Rejected & { readonly ref: string | null }) {
  const parsed = parse(clientMessage, input);
  if (parsed.ok) return { ok: true, message: parsed.value };
  const ref = typeof input === "object" && input !== null ? new Map(Object.entries(input)).get("ref") : undefined;
  return { ...parsed, ref: isRef(ref) ? ref : null };
}

export function parseCreateSplitRequest(
  input: unknown,
  id: MintedSplitId,
): { readonly ok: true; readonly split: Split } | Rejected {
  const parsed = parse(createRequest, input);
  return parsed.ok ? createSplit({ ...parsed.value.split, id }) : parsed;
}

export function parseNewSplit(input: unknown, id: MintedSplitId): { readonly ok: true; readonly split: Split } | Rejected {
  const parsed = parse(newSplit, input);
  return parsed.ok ? createSplit({ ...parsed.value, id }) : parsed;
}

class Malformed extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`malformed at ${path || "the root"}`);
    this.path = path;
  }
}

type Parser<T> = (input: unknown, path: string) => T;

type Fields = {
  read<T>(key: string, parser: Parser<T>): T;
  maybe<Key extends string, T>(key: Key, parser: Parser<T>): { readonly [Named in Key]?: T };
  has(key: string): boolean;
  fail(key: string): never;
};

function parse<T>(parser: Parser<T>, input: unknown): { readonly ok: true; readonly value: T } | Rejected {
  try {
    return { ok: true, value: parser(input, "") };
  } catch (error) {
    if (error instanceof Malformed) return { ok: false, rejection: { reason: "malformed", path: error.path } };
    throw error;
  }
}

function at(path: string, key: string | number): string {
  if (typeof key === "number") return `${path}[${key}]`;
  return path === "" ? key : `${path}.${key}`;
}

function check<T>(test: (input: unknown) => input is T): Parser<T> {
  return (input, path) => {
    if (!test(input)) throw new Malformed(path);
    return input;
  };
}

function literal<const T extends string | number>(value: T): Parser<T> {
  return check((input): input is T => input === value);
}

function oneOf<const T extends string>(values: readonly T[]): Parser<T> {
  return check((input): input is T => values.some((value) => value === input));
}

function nullable<T>(parser: Parser<T>): Parser<T | null> {
  return (input, path) => (input === null ? null : parser(input, path));
}

function array<T>(parser: Parser<T>, max: number): Parser<T[]> {
  return (input, path) => {
    if (!Array.isArray(input) || input.length > max) throw new Malformed(path);
    return input.map((element, index) => parser(element, at(path, index)));
  };
}

function nonEmpty<T>(parser: Parser<T>, max: number): Parser<NonEmpty<T>> {
  return (input, path) => {
    const values = array(parser, max)(input, path);
    if (values.length === 0) throw new Malformed(path);
    const [first, ...rest] = values;
    return [first, ...rest];
  };
}

function strict<T>(build: (fields: Fields) => T): Parser<T> {
  return (input, path) => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Malformed(path);
    const source = new Map(Object.entries(input));
    const seen = new Set<string>();
    const fields: Fields = {
      read(key, parser) {
        seen.add(key);
        return parser(source.get(key), at(path, key));
      },
      maybe(key, parser) {
        seen.add(key);
        const found: { [Named in typeof key]?: ReturnType<typeof parser> } = {};
        const value = source.get(key);
        if (value !== undefined) found[key] = parser(value, at(path, key));
        return found;
      },
      has: (key) => source.has(key),
      fail: (key) => {
        throw new Malformed(at(path, key));
      },
    };
    const value = build(fields);
    const extra = [...source.keys()].find((key) => !seen.has(key));
    if (extra !== undefined) throw new Malformed(at(path, extra));
    return value;
  };
}

function tagged<T>(tag: string, variants: { readonly [name: string]: Parser<T> }): Parser<T> {
  const byName = new Map(Object.entries(variants));
  return (input, path) => {
    const name = typeof input === "object" && input !== null ? new Map(Object.entries(input)).get(tag) : undefined;
    const variant = typeof name === "string" ? byName.get(name) : undefined;
    if (!variant) throw new Malformed(at(path, tag));
    return variant(input, path);
  };
}

const text = check((input): input is string => typeof input === "string");
const flag = check((input): input is boolean => typeof input === "boolean");
const count = check((input): input is number => typeof input === "number" && Number.isSafeInteger(input) && input >= 0);
const quantity = check((input): input is number => typeof input === "number" && Number.isInteger(input) && input >= 1 && input <= MAX_QUANTITY);
const storedQuantity = check((input): input is number => typeof input === "number" && Number.isInteger(input) && input >= 2 && input <= MAX_QUANTITY);
const cents = check(isCents);
const price = check(isPrice);
const splitId = check(isId<"SplitId">);
const itemId = check(isId<"ItemId">);
const adjustmentId = check(isId<"AdjustmentId">);
const participantId = check(isId<"ParticipantId">);
const deviceId = check(isId<"DeviceId">);
const receiptLevelKind = oneOf(RECEIPT_LEVEL_KINDS);
const schemaVersion = check((input): input is SchemaVersion => input === 1 || input === 2 || input === 3 || input === 4);

function pair<T>(parser: Parser<T>): Parser<readonly [T, T]> {
  return (input, path) => {
    if (!Array.isArray(input) || input.length !== 2) throw new Malformed(path);
    return [parser(input[0], at(path, 0)), parser(input[1], at(path, 1))];
  };
}

function part<Value extends number>(value: Parser<Value>): Parser<Part<Value>> {
  return (input, path) => {
    if (!Array.isArray(input) || input.length !== 2) throw new Malformed(path);
    return [participantId(input[0], at(path, 0)), value(input[1], at(path, 1))];
  };
}

function claimSet<T>(parser: Parser<T>): Parser<readonly [readonly T[]]> {
  return (input, path) => {
    if (!Array.isArray(input) || input.length !== 1) throw new Malformed(path);
    return [array(parser, MAX_PARTICIPANTS)(input[0], at(path, 0))];
  };
}

const itemSplit = tagged<ItemSplit>("by", {
  even: strict(({ read }) => ({ by: read("by", literal("even")), units: read("units", claimSet(participantId)) })),
  shares: strict(({ read }) => ({ by: read("by", literal("shares")), units: read("units", claimSet(part(count))) })),
  amount: strict(({ read }) => ({ by: read("by", literal("amount")), units: read("units", claimSet(part(cents))) })),
});

const itemFields = ({ read, maybe }: Fields) => ({
  name: read("name", text),
  price: read("price", price),
  ...maybe("detail", text),
  ...maybe("quantity", storedQuantity),
  split: read("split", itemSplit),
});
const itemEdit = ({ maybe }: Fields) => ({
  ...maybe("name", pair(text)),
  ...maybe("price", pair(price)),
  ...maybe("detail", pair(text)),
  ...maybe("quantity", pair(quantity)),
  ...maybe("split", pair(itemSplit)),
});

function unitClaims<T>(parser: Parser<T>) {
  return nonEmpty(array(parser, MAX_PARTICIPANTS), MAX_QUANTITY);
}

/** Items stored before per-unit claims list who had the whole line, which is one even unit. */
const lineClaimersAsOneUnit: Parser<LegacyItemSplit> = (input, path) => ({ by: "even", units: [array(participantId, MAX_PARTICIPANTS)(input, path)] });

const legacyItemSplit = tagged<LegacyItemSplit>("by", {
  even: strict(({ read }) => ({ by: read("by", literal("even")), units: read("units", unitClaims(participantId)) })),
  shares: strict(({ read }) => ({ by: read("by", literal("shares")), units: read("units", unitClaims(part(count))) })),
  amount: strict(({ read }) => ({ by: read("by", literal("amount")), units: read("units", unitClaims(part(cents))) })),
});

/** Reads an Item's `detail` where `detailed` allows one, and refuses the field elsewhere. */
function detailOf({ maybe, has, fail }: Fields, detailed: boolean): { readonly detail?: string } {
  if (!detailed && has("detail")) return fail("detail");
  return maybe("detail", text);
}

function legacyItemFields(detailed: boolean) {
  return (fields: Fields) => {
    const { read, has, fail } = fields;
    const head = { name: read("name", text), price: read("price", price), ...detailOf(fields, detailed) };
    if (has("claimedBy") === has("split")) return fail("split");
    return { ...head, split: has("split") ? read("split", legacyItemSplit) : read("claimedBy", lineClaimersAsOneUnit) };
  };
}
function legacyItemEdit(detailed: boolean) {
  return ({ maybe, has, fail }: Fields) => {
    if (!detailed && has("detail")) return fail("detail");
    return {
      ...maybe("name", pair(text)),
      ...maybe("price", pair(price)),
      ...maybe("detail", pair(text)),
      ...maybe("split", pair(legacyItemSplit)),
    };
  };
}
const bundle = strict(({ read }) => ({ name: read("name", text), items: read("items", nonEmpty(itemId, MAX_STORED_ITEMS)) }));

const receiptLevelFields = ({ read }: Fields) => ({ kind: read("kind", receiptLevelKind), name: read("name", text), amount: read("amount", cents) });
const anyAdjustmentFields = ({ read }: Fields) => {
  const kind = read("kind", oneOf(ADJUSTMENT_KINDS));
  const head = { name: read("name", text), amount: read("amount", cents) };
  return kind === "bundleDiscount" ? { kind, ...head, bundle: read("bundle", bundle) } : { kind, ...head };
};
const adjustmentFields = (bundles: boolean) => (bundles ? anyAdjustmentFields : receiptLevelFields);

function adjustmentEdit(bundles: boolean) {
  return ({ maybe, has, fail }: Fields) => {
    if (has("bundle") && (!bundles || has("kind"))) return fail("bundle");
    return {
      ...maybe("kind", pair(receiptLevelKind)),
      ...maybe("name", pair(text)),
      ...maybe("amount", pair(cents)),
      ...maybe("bundle", pair(bundle)),
    };
  };
}
const participantFields = ({ read }: Fields) => ({ name: read("name", text) });

function placed<T>(build: (fields: Fields) => T) {
  return strict((fields) => ({ ...build(fields), index: fields.read("index", count) }));
}

function rowWrite<const Kind extends string, RowId, Full, Edit>(
  kind: Kind,
  rowId: Parser<RowId>,
  full: (fields: Fields) => Full,
  edit: (fields: Fields) => Edit,
) {
  return strict((fields) => {
    const head = { kind: fields.read("kind", literal(kind)), id: fields.read("id", rowId) };
    if (fields.has("added")) return { ...head, added: fields.read("added", placed(full)) };
    if (fields.has("removed")) return { ...head, removed: fields.read("removed", placed(full)) };
    return { ...head, edit: fields.read("edit", strict(edit)) };
  });
}

type RowsWrite = Extract<Write | LegacyWrite, { readonly kind: "split" | "unsplit" | "perUnit" | "claimParts" }>;
type OtherWrite = Exclude<Write | LegacyWrite, { readonly kind: "item" } | RowsWrite>;

const quantityLine = strict(({ read }) => ({ quantity: read("quantity", storedQuantity), price: read("price", price), split: read("split", itemSplit) }));

const perUnit = strict(({ read }) => ({ kind: read("kind", literal("perUnit")), id: read("id", itemId) }));

const claimPart: Parser<ClaimPart> = (input, path) => {
  if (!Array.isArray(input) || input.length !== 3) throw new Malformed(path);
  return [itemId(input[0], at(path, 0)), oneOf(SPLIT_MODES)(input[1], at(path, 1)), count(input[2], at(path, 2))];
};

const claimParts = strict(({ read }) => ({
  kind: read("kind", literal("claimParts")),
  participantId: read("participantId", participantId),
  parts: read("parts", nonEmpty(claimPart, MAX_STORED_ITEMS)),
  claimed: read("claimed", flag),
}));

function rowsWrite<const Kind extends "split" | "unsplit">(kind: Kind) {
  return strict(({ read }) => ({ kind: read("kind", literal(kind)), id: read("id", itemId), ids: read("ids", nonEmpty(itemId, MAX_QUANTITY - 1)), line: read("line", quantityLine) }));
}

function otherWrites(bundles: boolean): { readonly [Kind in OtherWrite["kind"]]: Parser<Extract<OtherWrite, { kind: Kind }>> } {
  return {
    adjustment: rowWrite("adjustment", adjustmentId, adjustmentFields(bundles), adjustmentEdit(bundles)),
    participant: strict((fields) => {
      const head = { kind: fields.read("kind", literal("participant")), id: fields.read("id", participantId) };
      if (fields.has("added")) return { ...head, added: fields.read("added", placed(participantFields)) };
      return { ...head, removed: fields.read("removed", placed(participantFields)) };
    }),
    totals: strict(({ read }) => ({
      kind: read("kind", literal("totals")),
      subtotalDelta: read("subtotalDelta", cents),
      totalDelta: read("totalDelta", cents),
    })),
    payment: strict(({ read }) => ({
      kind: read("kind", literal("payment")),
      participantId: read("participantId", participantId),
      before: read("before", nullable(cents)),
      after: read("after", nullable(cents)),
    })),
    joined: strict(({ read }) => ({
      kind: read("kind", literal("joined")),
      participantId: read("participantId", participantId),
      joined: read("joined", flag),
    })),
    claims: strict(({ read }) => ({
      kind: read("kind", literal("claims")),
      itemIds: read("itemIds", nonEmpty(itemId, MAX_ITEMS)),
      participantIds: read("participantIds", nonEmpty(participantId, MAX_PARTICIPANTS)),
      claimed: read("claimed", flag),
    })),
  };
}

function change<ItemWrite>(bundles: boolean, item: Parser<ItemWrite>, rows: { readonly [Kind in RowsWrite["kind"]]?: Parser<RowsWrite> } = {}, maxWrites = MAX_WRITES_PER_CHANGE) {
  const write = tagged<ItemWrite | OtherWrite | RowsWrite>("kind", { item, ...otherWrites(bundles), ...rows });
  return strict(({ read, maybe }) => ({
    revision: read("revision", count),
    by: read("by", nullable(participantId)),
    undoes: read("undoes", nullable(count)),
    undoneBy: read("undoneBy", nullable(count)),
    writes: read("writes", nonEmpty(write, maxWrites)),
    ...maybe("at", count),
  }));
}

const item = strict((fields) => ({ id: fields.read("id", itemId), ...itemFields(fields) }));
const legacyItem = (detailed: boolean) => strict((fields) => ({ id: fields.read("id", itemId), ...legacyItemFields(detailed)(fields) }));
const receiptItemOf = (detailed: boolean) =>
  strict((fields) => ({
    id: fields.read("id", itemId),
    name: fields.read("name", text),
    price: fields.read("price", price),
    ...detailOf(fields, detailed),
    ...fields.maybe("quantity", quantity),
  }));
const receiptItem = receiptItemOf(true);
const receiptLevelAdjustment = strict((fields) => ({ id: fields.read("id", adjustmentId), ...receiptLevelFields(fields) }));
const anyAdjustment = strict((fields) => ({ id: fields.read("id", adjustmentId), ...anyAdjustmentFields(fields) }));
const participant = strict((fields) => ({ id: fields.read("id", participantId), ...participantFields(fields) }));
const paymentHandle = strict(({ read }) => ({ service: read("service", oneOf(PAYMENT_SERVICES)), handle: read("handle", text) }));
const paymentHandles = array(paymentHandle, PAYMENT_SERVICES.length);

function receipt<I, A>(itemParser: Parser<I>, adjustmentParser: Parser<A>, maxItems = MAX_ITEMS) {
  return strict((fields) => ({
    items: fields.read("items", array(itemParser, maxItems)),
    adjustments: fields.read("adjustments", array(adjustmentParser, MAX_ADJUSTMENTS)),
    subtotal: fields.read("subtotal", cents),
    total: fields.read("total", cents),
  }));
}

const participants = nonEmpty(participant, MAX_PARTICIPANTS);

const newSplit: Parser<Omit<NewSplit, "id">> = strict(({ read, maybe }) => ({
  receipt: read("receipt", receipt(receiptItem, anyAdjustment)),
  participants: read("participants", participants),
  paymentHandles: read("paymentHandles", paymentHandles),
  ...maybe("hostDevice", deviceId),
}));

const createRequest: Parser<CreateSplitRequest> = strict(({ read }) => ({
  split: read("split", newSplit),
}));

const pick = strict(({ read, maybe }) => ({ participantId: read("participantId", participantId), ...maybe("device", deviceId) }));

function legacyRows(version: LegacySplit["schemaVersion"]) {
  const adjustmentRow = version >= 2 ? anyAdjustment : receiptLevelAdjustment;
  const detailed = version >= 3;
  const itemWrite: Parser<LegacyItemWrite> = rowWrite("item", itemId, legacyItemFields(detailed), legacyItemEdit(detailed));
  const legacyChange: Parser<LegacyChange> = change(version >= 2, itemWrite);
  return { receipt: receipt(legacyItem(detailed), adjustmentRow), original: receipt(receiptItemOf(detailed), adjustmentRow), change: legacyChange };
}

const LEGACY_ROWS = { 1: legacyRows(1), 2: legacyRows(2), 3: legacyRows(3) } as const;

const itemWrite: Parser<Extract<Write, { kind: "item" }>> = rowWrite("item", itemId, itemFields, itemEdit);
const currentChange: Parser<Change> = change(true, itemWrite, { split: rowsWrite("split"), unsplit: rowsWrite("unsplit"), perUnit, claimParts }, MAX_STORED_WRITES_PER_CHANGE);
const CURRENT_ROWS = { receipt: receipt(item, anyAdjustment, MAX_STORED_ITEMS), original: receipt(receiptItem, anyAdjustment), change: currentChange };

/** Versions 1 to 3 stored one claim set per unit; they read with their own parsers and map to the current model. */
const split: Parser<Split> = strict((fields) => {
  const version = fields.read("schemaVersion", schemaVersion);
  if (version === 4) return { schemaVersion: version, ...splitFields(fields, CURRENT_ROWS) };
  const legacy: LegacySplit = { schemaVersion: version, ...splitFields(fields, LEGACY_ROWS[version]) };
  return fromLegacy(legacy);
});

function splitFields<R, O, C>({ read, maybe, has, fail }: Fields, rows: { readonly receipt: Parser<R>; readonly original: Parser<O>; readonly change: Parser<C> }) {
  return {
    id: read("id", splitId),
    currency: read("currency", literal("USD")),
    receipt: read("receipt", rows.receipt),
    ...maybe("original", rows.original),
    participants: read("participants", participants),
    picks: has("joined")
      ? has("picks")
        ? fail("joined")
        : (read("joined", array(participantId, MAX_PARTICIPANTS)), [])
      : (maybe("picks", array(pick, MAX_PARTICIPANTS)).picks ?? []).filter((held): held is NamePick => held.device !== undefined),
    payments: read(
      "payments",
      array(
        strict((fields) => ({ participantId: fields.read("participantId", participantId), amount: fields.read("amount", cents) })),
        MAX_PARTICIPANTS,
      ),
    ),
    paymentHandles: read("paymentHandles", paymentHandles),
    revision: read("revision", count),
    recentChanges: read("recentChanges", array(rows.change, RECENT_CHANGES_LIMIT)),
  };
}

// A page loaded before quantity lines sends unit 0 for the whole line, here and in claims.
const itemValue = ({ read, maybe }: Fields) => {
  maybe("unit", literal(0));
  return { participantId: read("participantId", participantId), value: read("value", count) };
};

const itemPatch = tagged<ItemPatch>("type", {
  add: strict(({ read, maybe }) => ({
    type: read("type", literal("add")),
    item: read("item", receiptItem),
    index: read("index", count),
    ...maybe("who", array(participantId, MAX_PARTICIPANTS)),
  })),
  edit: strict(({ read, maybe }) => ({
    type: read("type", literal("edit")),
    itemId: read("itemId", itemId),
    ...maybe("name", text),
    ...maybe("price", price),
    ...maybe("detail", text),
    ...maybe("by", oneOf(SPLIT_MODES)),
    ...maybe("values", array(strict(itemValue), MAX_PARTICIPANTS)),
  })),
  split: strict(({ read }) => ({
    type: read("type", literal("split")),
    itemId: read("itemId", itemId),
    ids: read("ids", nonEmpty(itemId, MAX_QUANTITY - 1)),
  })),
  delete: strict(({ read }) => ({ type: read("type", literal("delete")), itemId: read("itemId", itemId) })),
});

const adjustmentPatch = tagged<AdjustmentPatch>("type", {
  add: strict(({ read }) => ({
    type: read("type", literal("add")),
    adjustment: read("adjustment", receiptLevelAdjustment),
    index: read("index", count),
  })),
  edit: strict(({ read, maybe }) => ({
    type: read("type", literal("edit")),
    adjustmentId: read("adjustmentId", adjustmentId),
    ...maybe("kind", receiptLevelKind),
    ...maybe("name", text),
    ...maybe("amount", cents),
  })),
  delete: strict(({ read }) => ({ type: read("type", literal("delete")), adjustmentId: read("adjustmentId", adjustmentId) })),
});

function op<const Type extends string, Body>(type: Type, body: (fields: Fields) => Body) {
  return strict((fields) => ({
    type: fields.read("type", literal(type)),
    by: fields.read("by", nullable(participantId)),
    ...body(fields),
  }));
}

const claimFields = ({ read, maybe }: Fields) => {
  maybe("unit", literal(0));
  return { itemId: read("itemId", itemId), participantId: read("participantId", participantId) };
};

const operationVariants: { readonly [Type in Operation["type"]]: Parser<Extract<Operation, { type: Type }>> } = {
  editReceipt: op("editReceipt", ({ maybe }) => ({
    ...maybe("items", array(itemPatch, MAX_ITEMS)),
    ...maybe("adjustments", array(adjustmentPatch, MAX_ADJUSTMENTS)),
    ...maybe("subtotalDelta", cents),
    ...maybe("totalDelta", cents),
    ...maybe("totalFollows", check((input): input is true => input === true)),
  })),
  addParticipant: op("addParticipant", ({ read }) => ({ participant: read("participant", participant) })),
  removeParticipant: op("removeParticipant", ({ read }) => ({ participantId: read("participantId", participantId) })),
  claim: op("claim", claimFields),
  unclaim: op("unclaim", claimFields),
  recordPayment: op("recordPayment", ({ read }) => ({
    participantId: read("participantId", participantId),
    device: read("device", deviceId),
    amount: read("amount", cents),
  })),
  clearPayment: op("clearPayment", ({ read }) => ({ participantId: read("participantId", participantId), device: read("device", deviceId) })),
  setPaymentHandles: op("setPaymentHandles", ({ read }) => ({ handles: read("handles", nonEmpty(paymentHandle, PAYMENT_SERVICES.length)) })),
  pick: op("pick", ({ read }) => ({ participantId: read("participantId", participantId), device: read("device", deviceId), takeOver: read("takeOver", flag) })),
  undo: op("undo", ({ read }) => ({ revision: read("revision", count) })),
  restoreReceipt: op("restoreReceipt", () => ({})),
};

const operation = tagged<Operation>("type", operationVariants);

const REF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const isRef = (input: unknown): input is string => typeof input === "string" && REF_PATTERN.test(input);

const clientMessage: Parser<ClientMessage> = strict(({ read, maybe }) => ({
  ref: read("ref", check(isRef)),
  ...maybe("creatorSecret", text),
  op: read("op", operation),
}));

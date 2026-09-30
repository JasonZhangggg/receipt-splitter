import { isCents, isPrice } from "./money";
import { checkSplit, type AdjustmentPatch, type ItemPatch, type Operation, type Rejected } from "./operations";
import {
  ADJUSTMENT_KINDS,
  PAYMENT_SERVICES,
  isId,
  type AdjustmentId,
  type Change,
  type ItemId,
  type NonEmpty,
  type ParticipantId,
  type Split,
  type SplitId,
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
  return rejection ? { ok: false, rejection } : { ok: true, split: parsed.value };
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

function array<T>(parser: Parser<T>): Parser<T[]> {
  return (input, path) => {
    if (!Array.isArray(input)) throw new Malformed(path);
    return input.map((element, index) => parser(element, at(path, index)));
  };
}

function nonEmpty<T>(parser: Parser<T>): Parser<NonEmpty<T>> {
  return (input, path) => {
    const values = array(parser)(input, path);
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
const cents = check(isCents);
const price = check(isPrice);
const splitId = check(isId<SplitId>);
const itemId = check(isId<ItemId>);
const adjustmentId = check(isId<AdjustmentId>);
const participantId = check(isId<ParticipantId>);
const adjustmentKind = oneOf(ADJUSTMENT_KINDS);

function pair<T>(parser: Parser<T>): Parser<readonly [T, T]> {
  return (input, path) => {
    const values = array(parser)(input, path);
    if (values.length !== 2) throw new Malformed(path);
    return [values[0], values[1]];
  };
}

const itemFields = ({ read }: Fields) => ({
  name: read("name", text),
  price: read("price", price),
  claimedBy: read("claimedBy", array(participantId)),
});
const itemEdit = ({ maybe }: Fields) => ({ ...maybe("name", pair(text)), ...maybe("price", pair(price)) });
const adjustmentFields = ({ read }: Fields) => ({
  kind: read("kind", adjustmentKind),
  name: read("name", text),
  amount: read("amount", cents),
});
const adjustmentEdit = ({ maybe }: Fields) => ({
  ...maybe("kind", pair(adjustmentKind)),
  ...maybe("name", pair(text)),
  ...maybe("amount", pair(cents)),
});
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

const writeVariants: { readonly [Kind in Write["kind"]]: Parser<Extract<Write, { kind: Kind }>> } = {
  item: rowWrite("item", itemId, itemFields, itemEdit),
  adjustment: rowWrite("adjustment", adjustmentId, adjustmentFields, adjustmentEdit),
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
  claims: strict(({ read }) => ({
    kind: read("kind", literal("claims")),
    itemIds: read("itemIds", nonEmpty(itemId)),
    participantIds: read("participantIds", nonEmpty(participantId)),
    claimed: read("claimed", flag),
  })),
};

const change: Parser<Change> = strict(({ read }) => ({
  revision: read("revision", count),
  by: read("by", nullable(participantId)),
  undoes: read("undoes", nullable(count)),
  undoneBy: read("undoneBy", nullable(count)),
  writes: read("writes", nonEmpty(tagged<Write>("kind", writeVariants))),
}));

const item = strict((fields) => ({ id: fields.read("id", itemId), ...itemFields(fields) }));
const adjustment = strict((fields) => ({ id: fields.read("id", adjustmentId), ...adjustmentFields(fields) }));
const participant = strict((fields) => ({ id: fields.read("id", participantId), ...participantFields(fields) }));
const paymentHandle = strict(({ read }) => ({ service: read("service", oneOf(PAYMENT_SERVICES)), handle: read("handle", text) }));

const split: Parser<Split> = strict(({ read }) => ({
  schemaVersion: read("schemaVersion", literal(1)),
  id: read("id", splitId),
  currency: read("currency", literal("USD")),
  receipt: read(
    "receipt",
    strict((fields) => ({
      items: fields.read("items", nonEmpty(item)),
      adjustments: fields.read("adjustments", array(adjustment)),
      subtotal: fields.read("subtotal", cents),
      total: fields.read("total", cents),
    })),
  ),
  participants: read("participants", nonEmpty(participant)),
  payments: read(
    "payments",
    array(strict((fields) => ({ participantId: fields.read("participantId", participantId), amount: fields.read("amount", cents) }))),
  ),
  paymentHandles: read("paymentHandles", nonEmpty(paymentHandle)),
  revision: read("revision", count),
  recentChanges: read("recentChanges", array(change)),
}));

const itemPatch = tagged<ItemPatch>("type", {
  add: strict(({ read }) => ({
    type: read("type", literal("add")),
    item: read("item", strict((fields) => ({ id: fields.read("id", itemId), name: fields.read("name", text), price: fields.read("price", price) }))),
    index: read("index", count),
  })),
  edit: strict(({ read, maybe }) => ({
    type: read("type", literal("edit")),
    itemId: read("itemId", itemId),
    ...maybe("name", text),
    ...maybe("price", price),
  })),
  delete: strict(({ read }) => ({ type: read("type", literal("delete")), itemId: read("itemId", itemId) })),
});

const adjustmentPatch = tagged<AdjustmentPatch>("type", {
  add: strict(({ read }) => ({
    type: read("type", literal("add")),
    adjustment: read("adjustment", adjustment),
    index: read("index", count),
  })),
  edit: strict(({ read, maybe }) => ({
    type: read("type", literal("edit")),
    adjustmentId: read("adjustmentId", adjustmentId),
    ...maybe("kind", adjustmentKind),
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

const claimFields = ({ read }: Fields) => ({ itemId: read("itemId", itemId), participantId: read("participantId", participantId) });

const operationVariants: { readonly [Type in Operation["type"]]: Parser<Extract<Operation, { type: Type }>> } = {
  editReceipt: op("editReceipt", ({ maybe }) => ({
    ...maybe("items", array(itemPatch)),
    ...maybe("adjustments", array(adjustmentPatch)),
    ...maybe("subtotalDelta", cents),
    ...maybe("totalDelta", cents),
  })),
  addParticipant: op("addParticipant", ({ read }) => ({ participant: read("participant", participant) })),
  removeParticipant: op("removeParticipant", ({ read }) => ({ participantId: read("participantId", participantId) })),
  claim: op("claim", claimFields),
  unclaim: op("unclaim", claimFields),
  splitUnclaimed: op("splitUnclaimed", () => ({})),
  recordPayment: op("recordPayment", ({ read }) => ({
    participantId: read("participantId", participantId),
    amount: read("amount", cents),
  })),
  clearPayment: op("clearPayment", ({ read }) => ({ participantId: read("participantId", participantId) })),
  setPaymentHandles: op("setPaymentHandles", ({ read }) => ({ handles: read("handles", nonEmpty(paymentHandle)) })),
  undo: op("undo", ({ read }) => ({ revision: read("revision", count) })),
};

const operation = tagged<Operation>("type", operationVariants);

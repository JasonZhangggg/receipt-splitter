import { expectTypeOf, test } from "vitest";
import { createSplit } from "./operations";
import { parseNewSplit } from "./parse";
import { isId, isMintedSplitId, type ItemId, type MintedSplitId, type SplitId } from "./split";

test("parseNewSplit takes a Split id the server minted, and not a plain Split id", () => {
  expectTypeOf<MintedSplitId>().toExtend<Parameters<typeof parseNewSplit>[1]>();
  expectTypeOf<SplitId>().not.toExtend<Parameters<typeof parseNewSplit>[1]>();
});

test("createSplit takes a Split id the server minted, and not a plain Split id", () => {
  expectTypeOf<MintedSplitId>().toExtend<Parameters<typeof createSplit>[0]["id"]>();
  expectTypeOf<SplitId>().not.toExtend<Parameters<typeof createSplit>[0]["id"]>();
});

test("isId narrows to a plain Split id, never a minted one, and refuses a brand as its kind", () => {
  const raw: unknown = "a";
  if (isId<"SplitId">(raw)) {
    expectTypeOf(raw).toEqualTypeOf<SplitId>();
    expectTypeOf(raw).not.toExtend<MintedSplitId>();
  }
  // @ts-expect-error
  isId<MintedSplitId>(raw);
});

test("isId with no kind narrows to an id of some kind, with a union kind to either, and neither is a Split id", () => {
  const raw: unknown = "a";
  if (isId(raw)) {
    expectTypeOf(raw).toBeString();
    expectTypeOf(raw).not.toExtend<SplitId>();
    expectTypeOf(raw).not.toExtend<ItemId>();
  }
  if (isId<"ItemId" | "SplitId">(raw)) {
    expectTypeOf(raw).toBeString();
    expectTypeOf<ItemId>().toExtend<typeof raw>();
    expectTypeOf<SplitId>().toExtend<typeof raw>();
    expectTypeOf(raw).not.toExtend<SplitId>();
  }
});

test("isMintedSplitId guards a string to a minted Split id", () => {
  expectTypeOf(isMintedSplitId).guards.toEqualTypeOf<MintedSplitId>();
});

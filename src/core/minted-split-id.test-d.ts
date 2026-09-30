import { expectTypeOf, test } from "vitest";
import { createSplit } from "./operations";
import { parseNewSplit } from "./parse";
import { isId, type MintedSplitId, type SplitId } from "./split";

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

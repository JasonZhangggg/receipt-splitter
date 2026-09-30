import { expectTypeOf, test } from "vitest";
import { createSplit } from "./operations";
import { parseNewSplit } from "./parse";
import type { MintedSplitId, SplitId } from "./split";

test("parseNewSplit takes a Split id the server minted, and not a plain Split id", () => {
  expectTypeOf<MintedSplitId>().toExtend<Parameters<typeof parseNewSplit>[1]>();
  expectTypeOf<SplitId>().not.toExtend<Parameters<typeof parseNewSplit>[1]>();
});

test("createSplit takes a Split id the server minted, and not a plain Split id", () => {
  expectTypeOf<MintedSplitId>().toExtend<Parameters<typeof createSplit>[0]["id"]>();
  expectTypeOf<SplitId>().not.toExtend<Parameters<typeof createSplit>[0]["id"]>();
});

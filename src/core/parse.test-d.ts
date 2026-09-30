import { expectTypeOf, test } from "vitest";
import { parseNewSplit } from "./parse";
import type { MintedSplitId, SplitId } from "./split";

test("parseNewSplit takes a Split id the server minted, and not a plain Split id", () => {
  expectTypeOf<MintedSplitId>().toExtend<Parameters<typeof parseNewSplit>[1]>();
  expectTypeOf<SplitId>().not.toExtend<Parameters<typeof parseNewSplit>[1]>();
});

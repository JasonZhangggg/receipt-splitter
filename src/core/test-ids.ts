import { isMintedSplitId, type MintedSplitId } from "./split";

export function mintedId(value: string): MintedSplitId {
  if (!isMintedSplitId(value)) throw new RangeError(`${value} is not a minted Split id`);
  return value;
}

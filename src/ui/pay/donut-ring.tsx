import { Image } from "react-native";

import type { ParticipantId } from "../../core/split";
import { ring, ringMarkup, type Slice } from "./donut-model";

type Props = { slices: readonly Slice[]; paint: (id: ParticipantId) => string; track: string };

export function DonutRing({ slices, paint, track }: Props) {
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ring.size} ${ring.size}">${ringMarkup(slices, paint, track)}</svg>`)}`;
  return <Image aria-hidden source={{ uri }} style={{ width: ring.size, height: ring.size }} />;
}

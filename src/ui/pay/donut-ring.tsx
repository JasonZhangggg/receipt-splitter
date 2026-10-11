import { Image } from "react-native";

import type { ParticipantId } from "../../core/split";
import { ring, ringMarkup, type Slice } from "./donut-model";

const room = ring.picked;

type Props = { slices: readonly Slice[]; paint: (id: ParticipantId) => string; track: string; picked: ParticipantId | null };

export function DonutRing({ slices, paint, track, picked }: Props) {
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-${room} -${room} ${ring.size + room * 2} ${ring.size + room * 2}">${ringMarkup(slices, paint, track, picked)}</svg>`)}`;
  return <Image aria-hidden source={{ uri }} style={{ width: ring.size + room * 2, height: ring.size + room * 2, margin: -room }} />;
}

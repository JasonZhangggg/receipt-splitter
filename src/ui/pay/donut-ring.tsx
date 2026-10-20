import { Image, Pressable } from "react-native";

import type { ParticipantId } from "../../core/split";
import { arcAt, ring, ringMarkup, type Slice } from "./donut-model";

type Props = { slices: readonly Slice[]; paint: (id: ParticipantId) => string; track: string; tick?: (id: ParticipantId) => string | null; onPick?: (id: ParticipantId) => void };

// The image takes in the check discs' bleed and still lays out at `ring.size`.
const outer = ring.size + 2 * ring.bleed;

export function DonutRing({ slices, paint, track, tick, onPick }: Props) {
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-ring.bleed} ${-ring.bleed} ${outer} ${outer}">${ringMarkup(slices, paint, track, tick)}</svg>`)}`;
  const frame = { width: outer, height: outer, margin: -ring.bleed };
  const image = <Image aria-hidden source={{ uri }} style={onPick ? { width: outer, height: outer } : frame} />;
  if (!onPick) return image;
  return (
    <Pressable
      accessible={false}
      style={frame}
      onPress={({ nativeEvent }) => {
        const id = arcAt(slices, nativeEvent.locationX - outer / 2, nativeEvent.locationY - outer / 2);
        if (id !== null) onPick(id);
      }}
    >
      {image}
    </Pressable>
  );
}

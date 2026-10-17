import { Image, Pressable } from "react-native";

import type { ParticipantId } from "../../core/split";
import { arcAt, ring, ringMarkup, type Slice } from "./donut-model";

type Props = { slices: readonly Slice[]; paint: (id: ParticipantId) => string; track: string; onPick?: (id: ParticipantId) => void };

export function DonutRing({ slices, paint, track, onPick }: Props) {
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ring.size} ${ring.size}">${ringMarkup(slices, paint, track)}</svg>`)}`;
  const image = <Image aria-hidden source={{ uri }} style={{ width: ring.size, height: ring.size }} />;
  if (!onPick) return image;
  return (
    <Pressable
      accessible={false}
      onPress={({ nativeEvent }) => {
        const id = arcAt(slices, nativeEvent.locationX - ring.size / 2, nativeEvent.locationY - ring.size / 2);
        if (id !== null) onPick(id);
      }}
    >
      {image}
    </Pressable>
  );
}

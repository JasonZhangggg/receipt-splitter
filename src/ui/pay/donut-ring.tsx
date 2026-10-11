import { Image } from "react-native";

import { ring } from "./donut-model";

export function DonutRing({ markup }: { markup: string }) {
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ring.size} ${ring.size}">${markup}</svg>`)}`;
  return <Image aria-hidden source={{ uri }} style={{ width: ring.size, height: ring.size }} />;
}

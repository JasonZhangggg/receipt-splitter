import { Image } from "react-native";

import { paths, type IconName } from "./icon-glyphs";

export type { IconName };

const svg = (name: IconName, color: string) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;

export function Icon({ name, size, color }: { name: IconName; size: number; color: string }) {
  return <Image aria-hidden source={{ uri: svg(name, color) }} style={{ width: size, height: size }} {...{ dataSet: { icon: name } }} />;
}

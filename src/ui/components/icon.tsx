import { Image } from "react-native";

const paths = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  camera:
    '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14"/>',
  receipt: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2"/><path d="M7 7l1 12.5h8L17 7"/>',
  bag: '<path d="M6 8h12l-1 12H7z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  x: '<path d="M7 7l10 10M17 7 7 17"/>',
  pencil: '<path d="M14.5 5.5l4 4L9 19H5v-4z"/>',
  share: '<path d="M12 4v11M8 8l4-4 4 4"/><path d="M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6.5A1.5 1.5 0 0 0 14.5 5h-8A1.5 1.5 0 0 0 5 6.5v8A1.5 1.5 0 0 0 6.5 16H8"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  minus: '<path d="M5 12h14"/>',
  history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4.5v3.7h3.7"/><path d="M12 8.5V12l2.5 1.8"/>',
  expand: '<path d="M14 5h5v5M10 19H5v-5M19 5l-6 6M5 19l6-6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>',
};

export type IconName = keyof typeof paths;

const svg = (name: IconName, color: string) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;

export function Icon({ name, size, color }: { name: IconName; size: number; color: string }) {
  return <Image aria-hidden source={{ uri: svg(name, color) }} style={{ width: size, height: size }} {...{ dataSet: { icon: name } }} />;
}

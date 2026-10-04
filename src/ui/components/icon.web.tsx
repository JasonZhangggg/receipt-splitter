import { paths, type IconName } from "./icon-glyphs";

export type { IconName };

// A press goes to the button under the glyph: React Native Web's Pressable misses a touch whose target is one of the shapes.
const box = { display: "block", flexShrink: 0, pointerEvents: "none" } as const;

// Inline vector shapes paint in the frame that adds them; an image source can paint blank until it decodes.
export function Icon({ name, size, color }: { name: IconName; size: number; color: string }) {
  return (
    <svg
      aria-hidden
      data-icon={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={box}
      dangerouslySetInnerHTML={{ __html: paths[name] }}
    />
  );
}

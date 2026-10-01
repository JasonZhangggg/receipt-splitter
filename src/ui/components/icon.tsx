import { View, type ViewStyle } from "react-native";

type Rect = [x: number, y: number, width: number, height: number];

type Shape =
  | { fill: Rect }
  | { outline: Rect; sides?: "trbl" | "tl" | "rb" | "trl" | "rbl"; radius?: number; rotate?: number };

function corner(tipX: number, tipY: number, reach: number, sides: "tl" | "rb"): Shape {
  const side = reach * Math.SQRT2;
  const centerY = sides === "tl" ? tipY + reach : tipY - reach;
  return { outline: [tipX - side / 2, centerY - side / 2, side, side], sides, rotate: 45 };
}

export type IconName = "plus" | "chevron" | "camera" | "upload" | "receipt";

const shapes: Record<IconName, Shape[]> = {
  plus: [{ fill: [5, 11.25, 14, 1.5] }, { fill: [11.25, 5, 1.5, 14] }],
  chevron: [corner(12, 15, 6, "rb")],
  camera: [
    { outline: [4, 7.5, 16, 11.5], radius: 2 },
    { outline: [8.5, 5, 7, 2.5], sides: "trl", radius: 1 },
    { outline: [8.5, 9.5, 7, 7], radius: 4.25 },
  ],
  upload: [
    { fill: [11.25, 4.5, 1.5, 10.5] },
    corner(12, 4, 4.5, "tl"),
    { outline: [5, 14, 14, 5.5], sides: "rbl", radius: 1.5 },
  ],
  receipt: [{ outline: [6, 3, 12, 18], radius: 1.5 }, { fill: [9, 7.25, 6, 1.5] }, { fill: [9, 11.25, 6, 1.5] }],
};

const edges = { t: "borderTopWidth", r: "borderRightWidth", b: "borderBottomWidth", l: "borderLeftWidth" } as const;

function shapeStyle(shape: Shape, k: number, color: string): ViewStyle {
  if ("fill" in shape) {
    const [x, y, width, height] = shape.fill;
    return { position: "absolute", left: x * k, top: y * k, width: width * k, height: height * k, backgroundColor: color };
  }
  const stroke = 1.5;
  const [x, y, width, height] = shape.outline;
  const borders = Object.fromEntries([...(shape.sides ?? "trbl")].map((side) => [edges[side as keyof typeof edges], stroke * k]));
  return {
    position: "absolute",
    left: (x - stroke / 2) * k,
    top: (y - stroke / 2) * k,
    width: (width + stroke) * k,
    height: (height + stroke) * k,
    borderColor: color,
    borderRadius: (shape.radius ?? 0) * k,
    transform: shape.rotate ? [{ rotate: `${shape.rotate}deg` }] : undefined,
    ...borders,
  };
}

export function Icon({ name, size, color }: { name: IconName; size: number; color: string }) {
  const k = size / 24;
  return (
    <View aria-hidden style={{ width: size, height: size }}>
      {shapes[name].map((shape, i) => (
        <View key={i} style={shapeStyle(shape, k, color)} />
      ))}
    </View>
  );
}

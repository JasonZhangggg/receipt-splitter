const light = {
  field: "#FF5B2E",
  onField: "#17110E",
  fieldMuted: "#4A1D0E",
  paper: "#FAF7F2",
  ink: "#17110E",
  muted: "#6B625B",
  hairline: "#DDD5CC",
  rule: "#17110E",
  flag: "#B8330C",
  flagWash: "#FFE3D8",
  action: "#17110E",
  onAction: "#FAF7F2",
  bar: "#FAF7F2",
  scrim: "rgba(23, 17, 14, 0.45)",
  focus: "#17110E",
};

export type Colors = Record<keyof typeof light, string>;

const dark: Colors = {
  field: "#17110E",
  onField: "#FF6A3D",
  fieldMuted: "#C9B8AC",
  paper: "#221B17",
  ink: "#F6EFE8",
  muted: "#B3A79D",
  hairline: "#3A302A",
  rule: "#F6EFE8",
  flag: "#FF8A63",
  flagWash: "#3D2016",
  action: "#FF6A3D",
  onAction: "#17110E",
  bar: "#17110E",
  scrim: "rgba(0, 0, 0, 0.6)",
  focus: "#FF6A3D",
};

export const colors = { light, dark };

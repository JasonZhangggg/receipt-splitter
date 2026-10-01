const light = {
  field: "#FFFFFF",
  paper: "#F5F6F7",
  inset: "#FFFFFF",
  ink: "#111214",
  muted: "#696D74",
  hairline: "#E3E5E8",
  action: "#111214",
  onAction: "#FFFFFF",
  off: "#EEEFF1",
  onOff: "#696D74",
  flagWash: "#FFEF9E",
  flag: "#5A4500",
  bar: "rgba(255, 255, 255, 0.86)",
  sheet: "#FFFFFF",
  sheetIn: "#F5F6F7",
  focus: "#111214",
};

export type Colors = Record<keyof typeof light, string>;

const dark: Colors = {
  field: "#121315",
  paper: "#1C1D20",
  inset: "#2A2B2F",
  ink: "#F2F2F3",
  muted: "#A0A3A9",
  hairline: "#2F3135",
  action: "#F2F2F3",
  onAction: "#111214",
  off: "#26272B",
  onOff: "#A0A3A9",
  flagWash: "#463A0C",
  flag: "#FFE27A",
  bar: "rgba(18, 19, 21, 0.86)",
  sheet: "#1C1D20",
  sheetIn: "#2A2B2F",
  focus: "#F2F2F3",
};

export const colors = { light, dark };

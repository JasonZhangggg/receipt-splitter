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
  lift: "0 1px 1px rgba(17, 18, 20, 0.06), 0 12px 20px rgba(17, 18, 20, 0.08)",
  sheetShadow: "0 -1px 0 #E3E5E8, 0 -12px 32px rgba(17, 18, 20, 0.06)",
  panelShadow: "0 0 0 1px #E3E5E8, 0 12px 32px rgba(17, 18, 20, 0.06)",
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
  lift: "0 1px 1px rgba(0, 0, 0, 0.4), 0 12px 18px rgba(0, 0, 0, 0.35)",
  sheetShadow: "0 -1px 0 #2F3135, 0 -14px 36px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  panelShadow: "0 0 0 1px #2F3135, 0 12px 32px rgba(17, 18, 20, 0.06)",
};

export const colors = { light, dark };

export type Scheme = "light" | "dark";

/** The scheme this device picked, or null to follow the device's own setting. */
export type Appearance = Scheme | null;

/** public/index.html reads this key before the first paint. */
export const appearanceKey = "receipt-splitter:appearance";

export const resolveScheme = (picked: Appearance, system: Scheme): Scheme => picked ?? system;

/** Picking the scheme the device already uses goes back to following the device. */
export const pick = (want: Scheme, system: Scheme): Appearance => (want === system ? null : want);

export const flipped = (scheme: Scheme): Scheme => (scheme === "dark" ? "light" : "dark");

export function readAppearance(): Appearance {
  try {
    const stored = globalThis.localStorage?.getItem(appearanceKey);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

export function storeAppearance(picked: Appearance) {
  try {
    if (picked) globalThis.localStorage?.setItem(appearanceKey, picked);
    else globalThis.localStorage?.removeItem(appearanceKey);
  } catch {
    return;
  }
}

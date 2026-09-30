declare const centsBrand: unique symbol;
declare const priceBrand: unique symbol;

export type Cents = number & { readonly [centsBrand]: true };

export type Price = Cents & { readonly [priceBrand]: true };

export const MAX_CENTS = 10_000_000;

export function isCents(value: unknown): value is Cents {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function isPrice(value: unknown): value is Price {
  return isCents(value) && value >= 0;
}

export function cents(value: number): Cents {
  if (!isCents(value)) throw new RangeError(`${value} is not a whole number of cents`);
  return value;
}

export function price(value: number): Price {
  if (!isPrice(value)) throw new RangeError(`${value} is not a price of zero or more cents`);
  return value;
}

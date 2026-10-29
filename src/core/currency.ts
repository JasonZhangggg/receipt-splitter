/** The currencies a Split can be in, by ISO 4217 code. Every amount in a Split counts the currency's minor unit: cents, pence, or whole yen and won. */
export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "MXN", "JPY", "KRW", "CNY", "HKD", "TWD", "SGD", "INR", "THB", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "BRL", "ZAR", "AED"] as const;

export type Currency = (typeof CURRENCIES)[number];

export const isCurrency = (value: unknown): value is Currency => CURRENCIES.includes(value as Currency);

const WHOLE: ReadonlySet<Currency> = new Set(["JPY", "KRW", "TWD"]);

/** How many digits follow the decimal mark: 0 for the currencies counted in whole units, 2 for the rest. */
export const decimalsOf = (currency: Currency): 0 | 2 => (WHOLE.has(currency) ? 0 : 2);

/** How many minor units make one major unit: 100 cents to the dollar, 1 yen to the yen. */
export const unitOf = (currency: Currency): number => 10 ** decimalsOf(currency);

const formats = new Map<Currency, Intl.NumberFormat>();

function formatOf(currency: Currency): Intl.NumberFormat {
  let format = formats.get(currency);
  if (!format) {
    const digits = decimalsOf(currency);
    format = new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
    formats.set(currency, format);
  }
  return format;
}

/** For reading, in the viewer's own way of writing money: "$1,234.56", "1.234,56 €", "¥1,235". */
export const money = (amount: number, currency: Currency): string => formatOf(currency).format(amount / unitOf(currency));

/** The currency's sign as the viewer's locale writes it, for a field's unit: "$", "€", "CA$", "CHF". */
export function symbolOf(currency: Currency): string {
  return formatOf(currency).formatToParts(0).find((part) => part.type === "currency")?.value ?? currency;
}

const names = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "currency" }) : null;

/** "Euro", "Japanese Yen". */
export const currencyName = (currency: Currency): string => names?.of(currency) ?? currency;

/** For fields and copied values, which other apps parse: a dot, no thousands separator, and no sign. */
export function plainAmount(amount: number, currency: Currency): string {
  const digits = decimalsOf(currency);
  const sign = amount < 0 ? "-" : "";
  const whole = Math.trunc(Math.abs(amount) / unitOf(currency));
  return digits === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(Math.abs(amount) % 100).padStart(2, "0")}`;
}

const EURO = ["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES"];

const BY_REGION: Readonly<Record<string, Currency>> = {
  ...Object.fromEntries(EURO.map((region) => [region, "EUR" as const])),
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD",
  NZ: "NZD",
  MX: "MXN",
  JP: "JPY",
  KR: "KRW",
  CN: "CNY",
  HK: "HKD",
  TW: "TWD",
  SG: "SGD",
  IN: "INR",
  TH: "THB",
  CH: "CHF",
  LI: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  PL: "PLN",
  CZ: "CZK",
  BR: "BRL",
  ZA: "ZAR",
  AE: "AED",
};

/** The currency of the locale's region, as a guess for a Split the scan did not read one for, or USD. */
export function localCurrency(locale: string | undefined = (globalThis as { navigator?: { language?: string } }).navigator?.language): Currency {
  try {
    const region = locale ? new Intl.Locale(locale).maximize().region : undefined;
    return (region && BY_REGION[region]) || "USD";
  } catch {
    return "USD";
  }
}

const groupedFormats = new Map<Currency, Intl.NumberFormat>();

/** For reading beside a sign the layout already shows: "1,234.56", or "1.234,56" where the viewer writes it so. */
export function groupedAmount(amount: number, currency: Currency): string {
  let format = groupedFormats.get(currency);
  if (!format) {
    const digits = decimalsOf(currency);
    format = new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    groupedFormats.set(currency, format);
  }
  return format.format(amount / unitOf(currency));
}

const decimal = /^(\d{0,6})(?:[.,](\d{0,2}))?$/;
const whole = /^\d{1,8}$|^\d{1,3}(?:[.,]\d{3})+$/;

/** An amount as typed, in minor units, with a dot or a comma as the decimal mark (or, for whole-unit currencies, as thousands separators), or null when it doesn't read as one. */
export function parseAmount(text: string, currency: Currency): number | null {
  if (decimalsOf(currency) === 0) return whole.test(text) ? Number(text.replace(/[.,]/g, "")) : null;
  const match = decimal.exec(text);
  if (!match) return null;
  const [, major = "", minor = ""] = match;
  return Number(major || 0) * 100 + Number(minor.padEnd(2, "0"));
}

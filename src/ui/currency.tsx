import { createContext, useContext } from "react";

import type { Currency } from "../core/currency";

/** The currency of the Split on screen, or of the Draft on home. Everything under it writes amounts in it. */
export const CurrencyContext = createContext<Currency>("USD");

export const useCurrency = (): Currency => useContext(CurrencyContext);

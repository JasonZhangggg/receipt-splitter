import { StyleSheet, Text } from "react-native";

import { currencyName, money, type Currency } from "../../core/currency";
import type { Cents } from "../../core/money";
import { PressTarget, type Press } from "../components/button";
import { linkPress } from "../components/text-link";
import { copy } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { tabular, useColors } from "../theme";
import { useSaySize } from "./say-size";
import { padded } from "./words";

type Props = { total: Cents; currency: Currency; open: boolean; onOpen: (press: Press) => void };

/** The total in "I paid $X", ink over a light rule like the place beside it. A tap opens the currency menu. */
export function CurrencyWord({ total, currency, open, onOpen }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const size = useSaySize();
  return (
    <PressTarget name={copy.currencyOf(money(total, currency), currencyName(currency))} popup="dialog" expanded={open} onPress={onOpen} style={(pressed) => [styles.word, padded(size), pressStyle(pressed, reduce, linkPress)]}>
      {() => <Text style={[size.input, tabular, { borderBottomWidth: size.rule, color: c.ink, borderBottomColor: c.dash }]}>{money(total, currency)}</Text>}
    </PressTarget>
  );
}

const styles = StyleSheet.create({
  word: { alignItems: "baseline" },
});

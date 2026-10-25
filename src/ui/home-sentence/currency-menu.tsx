import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CURRENCIES, currencyName, localCurrency, symbolOf, type Currency } from "../../core/currency";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { UnderlineInput } from "../components/underline-input";
import { copy } from "../home-copy";
import { pressStyle, useReducedMotion } from "../motion";
import { tabular, type, useColors } from "../theme";

type Props = { currency: Currency; onPick: (currency: Currency) => void };

const COMMON: readonly Currency[] = ["USD", "EUR", "GBP", "CAD", "AUD", "MXN"];

/** The one in use, the browser's own, then the common ones: six rows before anything is typed. */
const shortList = (currency: Currency): readonly Currency[] => [...new Set([currency, localCurrency(), ...COMMON])].slice(0, 6);

/** Every currency whose name, code or sign holds what was typed. */
const matches = (typed: string): readonly Currency[] => {
  const query = typed.trim().toLowerCase();
  return CURRENCIES.filter((one) => [currencyName(one), one, symbolOf(one)].some((word) => word.toLowerCase().includes(query)));
};

/** A search field over the currencies a Split can be in: the common ones until something is typed, then every match, each with a tick on the one in use and its sign at the end in the muted color. */
export function CurrencyMenu({ currency, onPick }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState("");
  const shown = typed.trim() === "" ? shortList(currency) : matches(typed);
  return (
    <View>
      <View style={styles.search}>
        <UnderlineInput
          aria-label={copy.searchCurrencies}
          placeholder={copy.searchCurrencies}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          enterKeyHint="done"
          onSubmitEditing={() => shown.length === 1 && onPick(shown[0])}
        />
      </View>
      {shown.length === 0 ? <Text style={[type.body, styles.none, { color: c.muted }]}>{copy.noCurrency}</Text> : null}
      {shown.map((one) => (
        <PressTarget key={one} name={currencyName(one)} toggled={one === currency} outsideScroll onPress={() => onPick(one)} style={(pressed) => [pressStyle(pressed, reduce), styles.press]}>
          {(pressed) => (
            <View style={[styles.row, pressed && { backgroundColor: c.sheetIn }]}>
              <View style={styles.tick}>{one === currency ? <Icon name="chosen" size={14} color={c.ink} /> : null}</View>
              <Text numberOfLines={1} style={[type.body, styles.label, { color: c.ink }]}>
                {currencyName(one)}
              </Text>
              <Text style={[type.body, tabular, { color: c.muted }]}>{symbolOf(one)}</Text>
            </View>
          )}
        </PressTarget>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  press: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: 14 },
  tick: { width: 14, alignItems: "center" },
  search: { paddingHorizontal: 12, paddingBottom: 6 },
  none: { paddingHorizontal: 12, paddingVertical: 12 },
  label: { flex: 1 },
});

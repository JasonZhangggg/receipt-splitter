import { StyleSheet, Text, View } from "react-native";

import { CURRENCIES, currencyName, symbolOf, type Currency } from "../../core/currency";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion } from "../motion";
import { tabular, type, useColors } from "../theme";

type Props = { currency: Currency; onPick: (currency: Currency) => void };

/** Every currency a Split can be in, as the app menu lists apps: a tick on the one in use, then its name, with its sign at the end in the muted color. */
export function CurrencyMenu({ currency, onPick }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View>
      {CURRENCIES.map((one) => (
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
  label: { flex: 1 },
});

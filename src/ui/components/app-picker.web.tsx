import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { copy, paymentApps } from "../home-copy";
import { type, useColors } from "../theme";
import type { AppPickerProps } from "./app-picker";
import { Icon } from "./icon";

const pickerParts = { dataSet: { appPicker: "" } };

/** A native select showing the app's name, with a small chevron and a rule under it that darkens on focus. */
export function AppPicker({ service, choices, onPick }: AppPickerProps) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View {...pickerParts} style={[styles.picker, { borderBottomColor: focused ? c.ink : c.hairline }]}>
      <select
        aria-label={copy.paymentApp}
        value={service}
        onChange={(event) => onPick(event.target.value as typeof service)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ ...select, color: c.ink }}
      >
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {paymentApps[choice].name}
          </option>
        ))}
      </select>
      <View style={styles.chevron}>
        <Icon name="chevron" size={12} color={c.muted} />
      </View>
    </View>
  );
}

const select = {
  appearance: "none",
  border: 0,
  borderRadius: 0,
  background: "transparent",
  padding: "4px 22px 4px 0",
  fontFamily: type.input.fontFamily,
  fontWeight: 400,
  fontSize: 16,
  lineHeight: "23px",
  letterSpacing: -0.1,
  cursor: "pointer",
  outlineOffset: 2,
} as const;

const styles = StyleSheet.create({
  picker: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1 },
  chevron: { position: "absolute", right: 2, pointerEvents: "none" },
});

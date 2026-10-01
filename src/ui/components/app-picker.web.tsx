import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

import type { PaymentService } from "../../core/split";
import { copy, paymentApps } from "../home-copy";
import { type, useColors } from "../theme";
import type { AppPickerProps } from "./app-picker";
import { Icon } from "./icon";

const pickerParts = { dataSet: { appPicker: "" } };
const pressFace = { dataSet: { pressFace: "" } };

export function AppPicker({ service, choices, onPick }: AppPickerProps) {
  const c = useColors();
  const app = paymentApps[service];
  const showName = useWindowDimensions().width >= 360;
  return (
    <View {...pickerParts} style={[styles.picker, { borderRightColor: c.hairline }]}>
      <View {...pressFace} style={styles.face}>
        <View style={[styles.glyph, { backgroundColor: c.ink }]}>
          <Text style={[type.glyph, { color: c.paper }]}>{app.glyph}</Text>
        </View>
        {showName ? <Text style={[type.body, { color: c.ink }]}>{app.name}</Text> : null}
        <Icon name="chevron" size={16} color={c.muted} />
      </View>
      <select aria-label={copy.paymentApp} value={service} onChange={(event) => onPick(event.target.value as PaymentService)} style={select}>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {paymentApps[choice].name}
          </option>
        ))}
      </select>
    </View>
  );
}

const select = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  fontSize: 16,
  cursor: "pointer",
  appearance: "none",
} as const;

const styles = StyleSheet.create({
  picker: { justifyContent: "center", paddingLeft: 12, paddingRight: 10, borderRightWidth: 1 },
  face: { flexDirection: "row", alignItems: "center", gap: 8 },
  glyph: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
});

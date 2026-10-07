import { StyleSheet, View } from "react-native";

import { paymentApps } from "../home-copy";
import { switcherWidth } from "./switcher";
import type { MethodPickerProps } from "./method-picker";

const pickerParts = { dataSet: { appPicker: "" } };
// The switcher sits on the dark pill, so its focus ring is drawn inside it in the pill's text color and follows its round ends.
const pressFace = { dataSet: { pressFace: "", round: "" } };

/** A native select laid over the pill's chevron end, so the phone shows its own picker and a desktop its own menu. */
export function MethodPicker({ service, choices, onPick, name, children }: MethodPickerProps) {
  return (
    <View {...pickerParts} style={styles.over}>
      <View {...pressFace} style={styles.face}>
        <View aria-hidden style={styles.unseen}>{children}</View>
      </View>
      <select aria-label={name} value={service} onChange={(event) => onPick(event.target.value as typeof service)} style={select}>
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
  over: { position: "absolute", top: 0, right: 0, bottom: 0, width: switcherWidth },
  face: { flex: 1, borderTopRightRadius: 27, borderBottomRightRadius: 27 },
  unseen: { opacity: 0 },
});

import { StyleSheet, Text, View } from "react-native";

import { copy, paymentApps } from "../home-copy";
import { useColors } from "../theme";
import type { AppWordProps } from "./app-word";

const wordParts = { dataSet: { appWord: "" } };

/** The app's name as an underlined word in the sentence, with a native select laid invisibly over it, so a tap opens the system picker. */
export function AppWord({ service, choices, onPick }: AppWordProps) {
  const c = useColors();
  return (
    <View {...wordParts} style={styles.word}>
      <Text style={[styles.name, { color: c.ink, borderBottomColor: c.ink }]}>{paymentApps[service].name}</Text>
      <select aria-label={copy.paymentApp} value={service} onChange={(event) => onPick(event.target.value as typeof service)} style={select}>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {paymentApps[choice].name}
          </option>
        ))}
      </select>
    </View>
  );
}

// 16 px keeps iOS from zooming on focus; the select is invisible, so its size only sets the tap area, which the word's box gives it.
const select = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  appearance: "none",
  border: 0,
  margin: 0,
  padding: 0,
  fontSize: 16,
  cursor: "pointer",
} as const;

const styles = StyleSheet.create({
  word: { position: "relative", paddingVertical: 9, marginVertical: -9 },
  name: { borderBottomWidth: 1.5, lineHeight: 25 },
});

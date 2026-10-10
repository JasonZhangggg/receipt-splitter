import { StyleSheet, Text, View } from "react-native";

import type { ReceiptLevelKind } from "../../core/split";
import { PressTarget } from "../components/button";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";

export const addMenuWidth = 200;

/** What the receipt's Add row offers: an Item, or one of the three receipt-level lines. */
export type AddChoice = "item" | ReceiptLevelKind;

const choices: readonly { readonly choice: AddChoice; readonly label: string }[] = [
  { choice: "item", label: say.item },
  { choice: "tax", label: say.kinds.tax },
  { choice: "tip", label: say.kinds.tip },
  { choice: "discount", label: say.kinds.discount },
];

export function AddMenu({ onChoose }: { onChoose: (choice: AddChoice) => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View>
      {choices.map(({ choice, label }) => (
        <PressTarget key={choice} name={label} outsideScroll onPress={() => onChoose(choice)} style={(pressed) => [pressStyle(pressed, reduce), styles.press]}>
          {(pressed) => (
            <View style={[styles.row, pressed && { backgroundColor: c.sheetIn }]}>
              <Text style={[type.body, { color: c.ink }]}>{label}</Text>
            </View>
          )}
        </PressTarget>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  press: { alignSelf: "stretch" },
  row: { justifyContent: "center", minHeight: 44, paddingHorizontal: 12, borderRadius: 14 },
});

import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { claimersOf } from "../../core/operations";
import type { Participant, Split } from "../../core/split";
import { money } from "../../draft";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";

export const personMenuWidth = 264;

/** What tapping a person in the People sheet's Remove mode offers: Remove, with a gray line saying what goes with them when they had Items or paid. */
export function PersonMenu({ split, person, onRemove }: { split: Split; person: Participant; onRemove: () => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  // Read once as it opens: the line stays as it was while the menu leaves, even after the person is gone.
  const [note] = useState(() => {
    const items = split.receipt.items.filter((item) => claimersOf(item.split).includes(person.id)).length;
    const paid = split.payments.find(({ participantId }) => participantId === person.id)?.amount;
    return say.removeNote(person.name, items, paid === undefined ? null : money(paid));
  });
  return (
    <View>
      {note ? <Text style={[type.caption, styles.note, { color: c.muted }]}>{note}</Text> : null}
      <PressTarget name={say.removePerson(person.name)} outsideScroll onPress={onRemove} style={(pressed) => [pressStyle(pressed, reduce), styles.press]}>
        {(pressed) => (
          <View style={[styles.row, pressed && { backgroundColor: c.sheetIn }]}>
            <Icon name="trash" size={18} color={c.warn} />
            <Text numberOfLines={1} style={[type.body, styles.label, { color: c.warn }]}>
              {say.removePerson(person.name)}
            </Text>
          </View>
        )}
      </PressTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { paddingTop: 8, paddingBottom: 4, paddingHorizontal: 12 },
  press: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: 14 },
  label: { flexShrink: 1 },
});

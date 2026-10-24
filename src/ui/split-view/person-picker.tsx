import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ParticipantId } from "../../core/split";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { motion, tabular, type, useColors } from "../theme";

export const personPickerWidth = 264;

type Props = {
  rows: readonly { readonly id: ParticipantId; readonly name: string; readonly share: string }[];
  me: ParticipantId | null;
  viewed: ParticipantId | null;
  onView: (id: ParticipantId) => void;
  onEdit: () => void;
};

/** The wide layout's menu under "Your share": everyone with their share, the one shown checked, then Edit people for adding, removing and switching. */
export function PersonPicker({ rows, me, viewed, onView, onEdit }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const row = (key: string, name: string, onPress: () => void, end: ReactNode, checked?: boolean) => (
    <PressTarget key={key} name={name} toggled={checked} outsideScroll onPress={onPress} style={(pressed) => [pressStyle(pressed, reduce), styles.press]}>
      {(pressed, hovered) => (
        <View style={[styles.row, pressed || hovered ? [fillIn, { backgroundColor: c.sheetIn }] : fillOut]}>
          <View style={styles.check}>{checked ? <Icon name="chosen" size={14} color={c.ink} /> : null}</View>
          <Text numberOfLines={1} style={[type.body, styles.name, { color: c.ink }]}>
            {name}
          </Text>
          {end}
        </View>
      )}
    </PressTarget>
  );
  return (
    <View>
      {rows.map((person) =>
        row(person.id, person.id === me ? say.youName : person.name, () => onView(person.id), <Text style={[type.body, tabular, { color: c.muted }]}>{person.share}</Text>, person.id === viewed),
      )}
      <View style={[styles.rule, { backgroundColor: c.hairline }]} />
      {row("edit", say.editPeople, onEdit, null)}
    </View>
  );
}

// The row under the mouse fills at once and lets go over 200 ms, as Recent splits' rows do, so a sweep down the menu leaves no trail of lit rows.
const fillIn = webStyle({ transitionProperty: "background-color", transitionDuration: "0ms" });
const fillOut = webStyle({ transitionProperty: "background-color", transitionDuration: `${motion.pressOut}ms`, transitionTimingFunction: motion.easeOut });

const styles = StyleSheet.create({
  press: { alignSelf: "stretch" },
  // The rows, tick and spacing every menu on the page shares: 12 px in, a 14 px tick slot, 10 px apart.
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: 14 },
  check: { width: 14 },
  name: { flex: 1, minWidth: 0 },
  rule: { height: 1, marginVertical: 6, marginHorizontal: 8 },
});

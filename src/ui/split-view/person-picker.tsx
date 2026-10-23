import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ParticipantId } from "../../core/split";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { tabular, type, useColors } from "../theme";

export const personPickerWidth = 264;

type Props = {
  rows: readonly { readonly id: ParticipantId; readonly name: string; readonly share: string }[];
  me: ParticipantId | null;
  viewed: ParticipantId | null;
  onView: (id: ParticipantId) => void;
  onEdit: () => void;
};

/** The wide layout's menu under "What you had": everyone with their share, the one shown checked, then Edit people for adding, removing and switching. */
export function PersonPicker({ rows, me, viewed, onView, onEdit }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const row = (key: string, name: string, onPress: () => void, end: ReactNode, checked?: boolean) => (
    <PressTarget key={key} name={name} toggled={checked} outsideScroll onPress={onPress} style={(pressed) => [pressStyle(pressed, reduce), styles.press]}>
      {(pressed) => (
        <View style={[styles.row, pressed && { backgroundColor: c.sheetIn }]}>
          <View style={styles.check}>{checked ? <Icon name="check" size={16} color={c.ink} /> : null}</View>
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

const styles = StyleSheet.create({
  press: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingLeft: 8, paddingRight: 14, borderRadius: 14 },
  check: { width: 20, alignItems: "center" },
  name: { flex: 1, minWidth: 0 },
  rule: { height: 1, marginVertical: 6, marginHorizontal: 8 },
});

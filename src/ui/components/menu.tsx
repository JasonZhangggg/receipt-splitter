import { StyleSheet, Text, View } from "react-native";

import { pressStyle, useReducedMotion } from "../motion";
import { type, useColors } from "../theme";
import { PressTarget, type Press } from "./button";
import { Icon, type IconName } from "./icon";

export const menuWidth = 220;

export type MenuRow = { icon: IconName; label: string; onPress: (press: Press) => void };

/** The rows of the menu button's popover, on the Split page and on Home alike. */
export function MenuRows({ rows }: { rows: readonly MenuRow[] }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View>
      {rows.map(({ icon, label, onPress }) => (
        <PressTarget key={label} name={label} outsideScroll onPress={onPress} style={(pressed) => [pressStyle(pressed, reduce), styles.press]}>
          {(pressed) => (
            <View style={[styles.row, pressed && { backgroundColor: c.sheetIn }]}>
              <Icon name={icon} size={20} color={c.ink} />
              <Text numberOfLines={1} style={[type.body, styles.label, { color: c.ink }]}>
                {label}
              </Text>
            </View>
          )}
        </PressTarget>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  press: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, paddingHorizontal: 12, borderRadius: 14 },
  label: { flexShrink: 1 },
});

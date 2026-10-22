import { StyleSheet, Text, View } from "react-native";

import { SPLIT_MODES, type SplitMode } from "../../core/split";
import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";

export const modeMenuWidth = 264;

/** How an Item's price divides, picked from the Edit item sheet's mode link: each way with a line on what it does, a tick on the current one. */
export function ModeMenu({ value, onPick }: { value: SplitMode; onPick: (by: SplitMode) => void }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View>
      {SPLIT_MODES.map((mode) => {
        const on = mode === value;
        return (
          <PressTarget key={mode} name={say.modes[mode]} toggled={on} outsideScroll onPress={() => onPick(mode)} style={(pressed) => [pressStyle(pressed, reduce), styles.press]}>
            {(pressed) => (
              <View style={[styles.row, pressed && { backgroundColor: c.sheetIn }]}>
                <View style={styles.tick}>{on ? <Icon name="chosen" size={14} color={c.ink} /> : null}</View>
                <View style={styles.words}>
                  <Text style={[type.body, { color: c.ink }]}>{say.modes[mode]}</Text>
                  <Text style={[type.caption, { color: c.muted }]}>{say.modeHints[mode]}</Text>
                </View>
              </View>
            )}
          </PressTarget>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  press: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14 },
  // The tick sits on the first line's center: (24 - 14) / 2.
  tick: { width: 14, paddingTop: 5 },
  words: { flexShrink: 1 },
});

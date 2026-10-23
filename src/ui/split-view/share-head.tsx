import { StyleSheet, Text, View } from "react-native";

import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { linkPress } from "../components/text-link";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { splitCopy as say } from "../split-copy";
import { motion, type, useColors } from "../theme";

type Props = {
  /** "What you had", or "What Sam had" while someone else is shown. */
  title: string;
  open: boolean;
  onPick: (press: Press) => void;
};

/** The top of the wide layout's column: whose share is shown, which opens the people menu. The links the phone keeps under the intro sit in the top bar. */
export function ShareHead({ title, open, onPick }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View testID="share-head" style={[styles.head, { borderBottomColor: c.hairline }]}>
      <PressTarget name={`${title}. ${say.whoseItems}`} expanded={open} onPress={onPick} style={(pressed) => [styles.pick, pressStyle(pressed, reduce, linkPress)]}>
        {() => (
          <View style={styles.face}>
            <Text numberOfLines={1} style={[type.body, styles.title, { color: c.ink }]}>
              {title}
            </Text>
            <View style={[{ transform: [{ rotate: open ? "180deg" : "0deg" }] }, !reduce && turn]}>
              <Icon name="chevron" size={14} color={c.muted} />
            </View>
          </View>
        )}
      </PressTarget>
    </View>
  );
}

/** The chevron turns over with the menu it opens, at the menu's own 200 ms, and turns back as the menu leaves. */
const turn = webStyle({ transitionProperty: "transform", transitionDuration: `${motion.controlIn}ms`, transitionTimingFunction: motion.easeOut });

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottomWidth: 1, marginBottom: 4 },
  pick: { minHeight: 44, justifyContent: "center", flexShrink: 1, minWidth: 0 },
  face: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  title: { flexShrink: 1 },
});

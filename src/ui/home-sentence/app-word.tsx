import { StyleSheet, Text, View } from "react-native";

import type { PaymentService } from "../../core/split";
import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { linkPress } from "../components/text-link";
import { copy, paymentApps } from "../home-copy";
import { pressStyle, useReducedMotion, webStyle } from "../motion";
import { motion, useColors } from "../theme";
import { useSaySize } from "./say-size";
import { padded } from "./words";

type Props = { service: PaymentService; open: boolean; onOpen: (press: Press) => void };

/** The app's name as an underlined word in the sentence with a small chevron after it. A tap opens the app menu, which also adds a second app. */
export function AppWord({ service, open, onOpen }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  const size = useSaySize();
  return (
    <PressTarget name={`${copy.paymentApp}, ${paymentApps[service].name}`} popup="dialog" expanded={open} onPress={onOpen} style={(pressed) => [styles.word, padded(size), pressStyle(pressed, reduce, linkPress)]}>
      {() => (
        <View style={styles.face}>
          <Text style={[size.input, { borderBottomWidth: size.rule, color: c.ink, borderBottomColor: c.ink }]}>{paymentApps[service].name}</Text>
          <View style={[styles.chevron, { transform: [{ rotate: open ? "180deg" : "0deg" }] }, !reduce && turn]}>
            <Icon name="chevron" size={size.icon} color={c.muted} />
          </View>
        </View>
      )}
    </PressTarget>
  );
}

/** The chevron turns over with the menu it opens, at the menu's own 200 ms, as the Split page's filter button does. */
const turn = webStyle({ transitionProperty: "transform", transitionDuration: `${motion.controlIn}ms`, transitionTimingFunction: motion.easeOut });

const styles = StyleSheet.create({
  word: { alignItems: "baseline" },
  face: { flexDirection: "row", alignItems: "center", gap: 4 },
  chevron: { marginRight: -2 },
});

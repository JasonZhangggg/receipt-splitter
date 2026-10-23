import { StyleSheet, Text, View } from "react-native";

import { PressTarget, type Press } from "../components/button";
import { Icon } from "../components/icon";
import { TextLink, linkPress } from "../components/text-link";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";

type Props = {
  /** "What you had", or "What Sam had" while someone else is shown. */
  title: string;
  open: boolean;
  onPick: (press: Press) => void;
  onReceipt?: (press: Press) => void;
  onPayments: (press: Press) => void;
  onHistory: (press: Press) => void;
};

/** The top of the wide layout's column: whose share is shown, which opens the people menu, and the links the phone keeps under the intro. */
export function ShareHead({ title, open, onPick, onReceipt, onPayments, onHistory }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View style={[styles.head, { borderBottomColor: c.hairline }]}>
      <PressTarget name={`${title}. ${say.whoseItems}`} expanded={open} onPress={onPick} style={(pressed) => [styles.pick, pressStyle(pressed, reduce, linkPress)]}>
        {() => (
          <View style={styles.face}>
            <Text numberOfLines={1} style={[type.body, styles.title, { color: c.ink }]}>
              {title}
            </Text>
            <Icon name="chevron" size={14} color={c.muted} />
          </View>
        )}
      </PressTarget>
      <View style={styles.links}>
        {onReceipt ? <TextLink label={say.receipt} onPress={onReceipt} /> : null}
        <TextLink label={say.payments} onPress={onPayments} />
        <TextLink label={say.history} onPress={onHistory} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottomWidth: 1, marginBottom: 4 },
  pick: { minHeight: 44, justifyContent: "center", flexShrink: 1, minWidth: 0 },
  face: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  title: { flexShrink: 1 },
  links: { flexDirection: "row", columnGap: 16 },
});

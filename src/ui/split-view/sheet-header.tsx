import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { PressTarget } from "../components/button";
import { Icon } from "../components/icon";
import { pressStyle, useReducedMotion } from "../motion";
import { splitCopy as say } from "../split-copy";
import { type, useColors } from "../theme";

type Props = {
  title: string;
  onClose: () => void;
  /** Close takes no focus from a field being edited. */
  keepsFocus?: boolean;
  /** Sits left of the X, as the trash does in the Item sheet. */
  action?: ReactNode;
};

export function SheetHeader({ title, onClose, keepsFocus, action }: Props) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View style={styles.topline}>
      <Text role="heading" aria-level={2} style={[type.title, styles.title, { color: c.ink }]}>
        {title}
      </Text>
      <View style={styles.end}>
        {action}
        <PressTarget name={say.close} outsideScroll keepsFocus={keepsFocus} onPress={onClose} style={(pressed) => [styles.closeHit, pressStyle(pressed, reduce)]}>
          {() => (
            <View style={[styles.close, { backgroundColor: c.sheetIn }]}>
              <Icon name="x" size={16} color={c.ink} />
            </View>
          )}
        </PressTarget>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { marginTop: 2 },
  end: { flexDirection: "row", alignItems: "center" },
  closeHit: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});

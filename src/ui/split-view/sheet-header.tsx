import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { IconAction } from "../components/sheet-fields";
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
  return (
    <View style={styles.topline}>
      <Text role="heading" aria-level={2} style={[type.title, styles.title, { color: c.ink }]}>
        {title}
      </Text>
      <View style={styles.end}>
        {action}
        <View style={styles.close}>
          <IconAction label={say.close} icon="x" size={16} keepsFocus={keepsFocus} pressedInk="ink" onPress={onClose} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { marginTop: 2 },
  end: { flexDirection: "row", alignItems: "center" },
  close: { marginRight: -14 },
});

import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { IconAction } from "../components/sheet-fields";
import { webStyle } from "../motion";
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

const stuck = webStyle({ position: "sticky", top: "0" });

/** A sheet's title row stays at the top of the scrolling sheet while the list moves under it. Its ground hides what scrolls beneath. */
export function Pinned({ children }: { children: ReactNode }) {
  const c = useColors();
  return <View style={[stuck, styles.pinned, { backgroundColor: c.sheet }]}>{children}</View>;
}

export function SheetHeader({ title, onClose, keepsFocus, action }: Props) {
  const c = useColors();
  return (
    <Pinned>
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
    </Pinned>
  );
}

const styles = StyleSheet.create({
  pinned: { paddingBottom: 6, marginBottom: -6, zIndex: 1 },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { marginTop: 2 },
  end: { flexDirection: "row", alignItems: "center" },
  close: { marginRight: -14 },
});

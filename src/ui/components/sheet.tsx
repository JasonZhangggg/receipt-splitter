import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "../theme";

export const panel = { top: 64, width: 380, right: 32 };

export function Sheet({ wide, children }: { wide: boolean; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  if (wide) {
    return (
      <View
        style={[
          styles.panel,
          { backgroundColor: c.sheet, boxShadow: c.panelShadow, top: panel.top + insets.top, right: panel.right + insets.right, width: panel.width },
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <View
      style={[
        styles.sheet,
        {
          backgroundColor: c.sheet,
          boxShadow: c.sheetShadow,
          paddingBottom: 24 + insets.bottom,
          paddingLeft: 20 + insets.left,
          paddingRight: 20 + insets.right,
        },
      ]}
    >
      <View style={[styles.grab, { backgroundColor: c.hairline }]} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  grab: { alignSelf: "center", width: 36, height: 5, marginBottom: 18, borderRadius: 3 },
  content: { alignSelf: "center", width: "100%", maxWidth: 440, gap: 16 },
  panel: { position: "absolute", padding: 20, gap: 12, borderRadius: 28 },
});

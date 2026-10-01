import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "../theme";

export const panelTop = 64;

export function Sheet({ wide, children }: { wide: boolean; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  if (wide) {
    return (
      <View
        style={[
          styles.panel,
          { backgroundColor: c.sheet, boxShadow: c.panelShadow, top: panelTop + insets.top, right: 32 + insets.right },
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
  panel: { position: "absolute", width: 380, padding: 20, gap: 12, borderRadius: 28 },
});

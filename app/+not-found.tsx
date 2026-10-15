import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../src/ui/components/button";
import { joinCopy } from "../src/ui/home-copy";
import { SplitHeader } from "../src/ui/split-view/header";
import { layout, type, useColors } from "../src/ui/theme";

export default function NotFound() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: c.field, paddingTop: insets.top, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}>
      <View style={styles.column}>
        <SplitHeader />
        <View style={styles.body}>
          <Text style={[type.hero, { color: c.ink }]}>{joinCopy.noPage}</Text>
          <View style={styles.action}>
            <Button label={joinCopy.newSplit} onPress={() => router.replace("/")} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { alignSelf: "center", width: "100%", maxWidth: 480 },
  body: { gap: 8, paddingTop: 24 },
  action: { marginTop: 16 },
});

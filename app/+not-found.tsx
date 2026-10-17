import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../src/ui/components/button";
import { Toast } from "../src/ui/components/toast";
import { joinCopy } from "../src/ui/home-copy";
import { SplitHeader, useSiteShare } from "../src/ui/split-view/header";
import { layout, type, useColors } from "../src/ui/theme";

export default function NotFound() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const site = useSiteShare();
  return (
    <View style={[styles.screen, { backgroundColor: c.field, paddingTop: insets.top, paddingLeft: layout.gutter + insets.left, paddingRight: layout.gutter + insets.right }]}>
      <View style={styles.column}>
        <SplitHeader onShare={site.share} />
        <View style={styles.body}>
          <Text role="heading" aria-level={1} style={[type.hero, { color: c.ink }]}>
            {joinCopy.noPage.title}
          </Text>
          <Text style={[type.body, { color: c.muted }]}>{joinCopy.noPage.hint}</Text>
          <View style={styles.action}>
            <Button label={joinCopy.newSplit} onPress={() => router.replace("/")} />
          </View>
        </View>
      </View>
      <Toast message={site.notice} onHide={site.hideNotice} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { alignSelf: "center", width: "100%", maxWidth: 480 },
  body: { gap: 8, paddingTop: 24 },
  action: { marginTop: 16 },
});

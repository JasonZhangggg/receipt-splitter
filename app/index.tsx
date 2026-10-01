import { router } from "expo-router";
import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { prefetchModel } from "../src/ocr";
import { Button } from "../src/ui/components/button";
import { copy } from "../src/ui/home-copy";
import { breakpoints, space, type, useColors } from "../src/ui/theme";

export default function Home() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  useEffect(prefetchModel, []);
  const showBar = width < breakpoints.bottomBarBelow;
  const padding = { paddingTop: space.xxl + insets.top, paddingLeft: space.xl + insets.left, paddingRight: space.xl + insets.right };

  const startScan = () => router.push("/new");

  return (
    <View style={[styles.screen, { backgroundColor: c.paper }]}>
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, padding]}>
        <Text role="heading" aria-level={1} style={[type.kicker, { color: c.ink }]}>
          {copy.wordmark}
        </Text>
        {showBar ? null : <View style={styles.inlineAction}><Button label={copy.action} onPress={startScan} /></View>}
      </ScrollView>

      {showBar ? (
        <View
          style={[
            styles.bar,
            {
              backgroundColor: c.bar,
              borderTopColor: c.hairline,
              paddingBottom: space.m + insets.bottom,
              paddingLeft: space.xl + insets.left,
              paddingRight: space.xl + insets.right,
            },
          ]}
        >
          <Button label={copy.action} onPress={startScan} outsideScroll />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: space.xl, paddingBottom: space.huge * 10 },
  inlineAction: { alignSelf: "flex-start" },
  bar: { paddingTop: space.m, borderTopWidth: StyleSheet.hairlineWidth },
});

import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { prefetchModel } from "../src/ocr";
import { Button, PressTarget } from "../src/ui/components/button";
import { NameChips } from "../src/ui/components/name-chips";
import { PaymentRow } from "../src/ui/components/payment-row";
import { panelTop, Sheet } from "../src/ui/components/sheet";
import { Slip } from "../src/ui/components/slip";
import { copy } from "../src/ui/home-copy";
import { breakpoints, type, useColors } from "../src/ui/theme";

const unwired = () => {};

export default function Home() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  useEffect(prefetchModel, []);
  const wide = width >= breakpoints.panelFrom;
  const hero = wide ? copy.hero.desktop : copy.hero.phone;
  const gutter = wide ? 32 : 20;
  const sides = { paddingLeft: gutter + insets.left, paddingRight: gutter + insets.right };

  return (
    <View style={[styles.screen, { backgroundColor: c.field }]}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.page}>
        <View style={[styles.header, wide && styles.headerWide, sides, { paddingTop: (wide ? 20 : 4) + insets.top }]}>
          <Text role="heading" aria-level={1} style={[type.wordmark, { color: c.ink }]}>
            {copy.wordmark}
          </Text>
          <Button kind="link" icon="receipt" label={copy.example} onPress={unwired} />
        </View>
        <PressTarget
          onPress={unwired}
          style={() => [
            styles.hero,
            wide
              ? [
                  styles.heroWide,
                  {
                    marginLeft: gutter + insets.left,
                    marginRight: panelSpace + insets.right,
                    backgroundColor: c.paper,
                    boxShadow: `inset 0 0 0 1.5px ${c.hairline}`,
                  },
                ]
              : sides,
          ]}
        >
          {(pressed) => (
            <>
              <Slip icon={wide ? "upload" : "camera"} pressed={pressed} />
              <Text style={[type.hero, { color: c.ink }]}>{hero.title}</Text>
              <Text style={[type.secondary, { color: c.muted }]}>{hero.hint}</Text>
            </>
          )}
        </PressTarget>
      </ScrollView>

      <Sheet wide={wide}>
        <PaymentRow service="venmo" onPickApp={unwired} onAddApp={unwired} outsideScroll />
        <NameChips names={[copy.me]} onAdd={unwired} outsideScroll />
        <View style={styles.action}>
          <Button label={copy.action} onPress={unwired} outsideScroll disabled />
        </View>
      </Sheet>
    </View>
  );
}

const panelSpace = 32 + 380 + 28;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { flexGrow: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56 },
  headerWide: { minHeight: panelTop },
  hero: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  heroWide: { marginBottom: 32, paddingTop: 24, paddingBottom: 48, paddingHorizontal: 32, borderRadius: 32 },
  action: { marginTop: 8 },
});

import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, TextButton } from "../src/ui/components/button";
import { ListRow } from "../src/ui/components/list-row";
import { formatCents, MoneyText } from "../src/ui/components/money-text";
import { Sheet } from "../src/ui/components/sheet";
import { enter, useReducedMotion } from "../src/ui/motion";
import { breakpoints, motion, space, type, useColors } from "../src/ui/theme";

const headline = ["Split the bill", "at the table."];

const example = {
  merchant: "Nonna Rosa",
  detail: "Table 12, Sep 29, 8:41 PM",
  items: [
    { name: "Margherita pizza", cents: 1800 },
    { name: "Caesar salad", cents: 1250 },
    { name: "Spicy rigatoni", cents: 2100 },
    { name: "Lemonade pitcher", cents: 1400 },
    { name: "Tiramisu", cents: 850 },
  ],
  misread: "Tiramisu",
  adjustments: [
    { name: "Subtotal", cents: 7500 },
    { name: "Tax", cents: 666 },
    { name: "Tip 20%", cents: 1500 },
  ],
  subtotal: 7500,
  total: 9666,
};
const itemsSum = example.items.reduce((sum, item) => sum + item.cents, 0);

export default function Home() {
  const c = useColors();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const barred = width < breakpoints.bottomBarBelow;
  const wide = width >= breakpoints.twoColumnsFrom;
  const [aboutOpen, setAboutOpen] = useState(false);

  const scan = <Button label="Scan a receipt" onPress={() => router.push("/new")} />;

  return (
    <View style={[styles.screen, { backgroundColor: c.paper }]}>
      <ScrollView contentContainerStyle={wide && styles.columns} style={styles.screen}>
        <View
          style={[
            styles.field,
            wide && styles.fieldWide,
            { backgroundColor: c.field, paddingTop: space.xxl + insets.top },
          ]}
        >
          <Text role="heading" aria-level={1} style={[type.kicker, styles.wordmark, { color: c.onField }]}>
            Receipt Splitter
          </Text>
          <View style={styles.headline}>
            {headline.map((line, i) => (
              <View key={line} style={styles.mask}>
                <Text
                  style={[
                    type.display,
                    wide && type.displayWide,
                    { color: c.onField },
                    enter(reduce, { delay: 60 + i * 70, duration: motion.headline, from: "unmask" }),
                  ]}
                >
                  {line}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.pitch}>
            <Text style={[type.body, wide && type.bodyWide, { color: c.onField }]}>
              Take a photo of the receipt and send the link. Everyone taps what they ordered and pays you back.
            </Text>
            {barred ? null : <View style={styles.inlineAction}>{scan}</View>}
            <TextButton
              label="The photo stays on your phone."
              color={c.fieldMuted}
              onPress={() => setAboutOpen(true)}
            />
          </View>
        </View>

        <View style={[styles.paper, wide && styles.paperWide]}>
          <Text style={[type.kicker, { color: c.muted }]}>Example scan</Text>
          <Text style={[type.title, styles.merchant, { color: c.ink }]}>{example.merchant}</Text>
          <Text style={[type.small, { color: c.muted }]}>{example.detail}</Text>
          <View style={[styles.rule, { backgroundColor: c.rule }]} />
          {example.items.map((item, i) => {
            const flagged = item.name === example.misread;
            return (
              <ListRow
                key={item.name}
                title={item.name}
                note={flagged ? "Check this price." : undefined}
                flagged={flagged}
                trailing={<MoneyText cents={item.cents} color={flagged ? c.flag : c.ink} />}
                style={enter(reduce, { delay: 280 + i * motion.stagger })}
              />
            );
          })}
          {example.adjustments.map((row) => (
            <View key={row.name} style={styles.adjustment}>
              <Text style={[type.body, styles.adjustmentName, { color: c.muted }]}>{row.name}</Text>
              <MoneyText cents={row.cents} size="body" color={c.muted} />
            </View>
          ))}
          <View style={[styles.rule, { backgroundColor: c.rule }]} />
          <View style={styles.total}>
            <Text style={[type.heading, { color: c.ink }]}>Total</Text>
            <MoneyText cents={example.total} size="total" color={c.ink} />
          </View>
          <Text style={[type.small, styles.status, { color: c.flag }]}>
            {`Items add up to ${formatCents(itemsSum)}, ${formatCents(example.subtotal - itemsSum)} short of the subtotal.`}
          </Text>
        </View>
      </ScrollView>

      {barred ? (
        <View style={[styles.bar, { backgroundColor: c.bar, borderTopColor: c.hairline, paddingBottom: space.m + insets.bottom }]}>
          {scan}
        </View>
      ) : null}

      <Sheet open={aboutOpen} onClose={() => setAboutOpen(false)} title="Your photo stays on your phone">
        <Text style={[type.body, { color: c.ink }]}>
          Receipt Splitter reads the receipt on this device. The photo is never uploaded. The Split you share holds
          the items and prices, not the photo.
        </Text>
        <Button label="Got it" onPress={() => setAboutOpen(false)} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  columns: { flexDirection: "row", minHeight: "100%" },
  field: { paddingHorizontal: space.xl, paddingBottom: space.xxl + space.xs },
  fieldWide: { flex: 1.2, paddingHorizontal: space.huge, paddingTop: space.huge },
  wordmark: { fontSize: 13, letterSpacing: 2.4, marginBottom: space.xl + space.xs },
  headline: { marginBottom: space.l + space.xs },
  mask: { overflow: "hidden" },
  pitch: { gap: space.xl, maxWidth: 480 },
  inlineAction: { alignSelf: "flex-start" },
  paper: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl },
  paperWide: { flex: 1, maxWidth: 640, paddingHorizontal: space.huge, paddingTop: space.huge },
  merchant: { marginTop: space.s },
  rule: { height: 3, marginTop: space.l },
  adjustment: { flexDirection: "row", alignItems: "baseline", paddingTop: space.m },
  adjustmentName: { flex: 1, fontSize: 16 },
  total: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: space.m },
  status: { marginTop: space.m },
  bar: { paddingHorizontal: space.xl, paddingTop: space.m, borderTopWidth: StyleSheet.hairlineWidth },
});

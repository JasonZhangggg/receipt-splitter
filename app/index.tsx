import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../src/ui/components/button";
import { ListRow } from "../src/ui/components/list-row";
import { formatCents, MoneyText } from "../src/ui/components/money-text";
import { enter, useReducedMotion } from "../src/ui/motion";
import { breakpoints, headlineType, motion, space, type, useColors } from "../src/ui/theme";

const headline = ["Split the bill", "at the table."];

const example = {
  merchant: "Nonna Rosa",
  detail: "Table 12, Sep 29, 8:41 PM",
  items: [
    { name: "Margherita pizza", cents: 1800 },
    { name: "Caesar salad", cents: 1250 },
    { name: "Spicy rigatoni", cents: 2100 },
    { name: "Lemonade pitcher", cents: 1400 },
    { name: "Tiramisu", cents: 850, flagged: true },
  ],
  subtotal: 7500,
  adjustments: [
    { name: "Tax", cents: 666 },
    { name: "Tip 20%", cents: 1500 },
  ],
};
const sum = (rows: { cents: number }[]) => rows.reduce((total, row) => total + row.cents, 0);
const itemsSum = sum(example.items);
const summary = [{ name: "Subtotal", cents: example.subtotal }, ...example.adjustments];
const total = example.subtotal + sum(example.adjustments);

export default function Home() {
  const c = useColors();
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const showBar = width < breakpoints.bottomBarBelow;
  const wide = width >= breakpoints.twoColumnsFrom;
  const title = headlineType(width);
  const top = (wide ? space.huge : space.xxl) + insets.top;
  const gutter = wide ? space.huge : space.xl;
  const fieldPadding = { paddingTop: top, paddingLeft: gutter + insets.left, paddingRight: gutter + (wide ? 0 : insets.right) };
  const paperPadding = {
    paddingTop: wide ? top : space.xxl,
    paddingLeft: gutter + (wide ? 0 : insets.left),
    paddingRight: gutter + insets.right,
  };

  const scan = <Button label="Scan or upload a receipt" onPress={() => router.push("/new")} />;

  return (
    <View style={[styles.screen, { backgroundColor: c.paper }]}>
      <ScrollView contentContainerStyle={wide && styles.columns} style={styles.screen}>
        <View style={[styles.field, wide && styles.fieldWide, fieldPadding, { backgroundColor: c.field }]}>
          <Text role="heading" aria-level={1} style={[type.kicker, styles.wordmark, { color: c.onField }]}>
            Receipt Splitter
          </Text>
          <View style={styles.headline}>
            {headline.map((line, i) => (
              <View key={line} style={[styles.mask, { marginBottom: -title.descender }]}>
                <Text
                  style={[
                    title.text,
                    { color: c.onField, paddingBottom: title.descender },
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
            {showBar ? null : <View style={styles.inlineAction}>{scan}</View>}
            <Text style={[type.small, { color: c.fieldMuted }]}>The photo stays on your phone.</Text>
          </View>
        </View>

        <View style={[styles.paper, wide && styles.paperWide, paperPadding]}>
          <Text style={[type.kicker, { color: c.muted }]}>Example scan</Text>
          <Text style={[type.title, styles.merchant, { color: c.ink }]}>{example.merchant}</Text>
          <Text style={[type.small, { color: c.muted }]}>{example.detail}</Text>
          <View style={[styles.rule, { backgroundColor: c.rule }]} />
          {example.items.map((item, i) => (
            <ListRow
              key={item.name}
              title={item.name}
              note={item.flagged ? "Check this price." : undefined}
              flagged={item.flagged}
              trailing={<MoneyText cents={item.cents} color={item.flagged ? c.flag : c.ink} />}
              style={enter(reduce, { delay: 280 + i * motion.stagger })}
            />
          ))}
          {summary.map((row) => (
            <View key={row.name} style={styles.summaryRow}>
              <Text style={[type.body, styles.summaryName, { color: c.muted }]}>{row.name}</Text>
              <MoneyText cents={row.cents} size="body" color={c.muted} />
            </View>
          ))}
          <View style={[styles.rule, { backgroundColor: c.rule }]} />
          <View style={styles.total}>
            <Text style={[type.heading, { color: c.ink }]}>Total</Text>
            <MoneyText cents={total} size="total" color={c.ink} />
          </View>
          <Text style={[type.small, styles.status, { color: c.flag }]}>
            {`Items add up to ${formatCents(itemsSum)}, ${formatCents(example.subtotal - itemsSum)} short of the subtotal.`}
          </Text>
        </View>
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
          {scan}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  columns: { flexDirection: "row", minHeight: "100%" },
  field: { paddingBottom: space.xxl + space.xs },
  fieldWide: { flex: 1.2 },
  wordmark: { fontSize: 13, letterSpacing: 2.4, marginBottom: space.xl + space.xs },
  headline: { marginBottom: space.l + space.xs },
  mask: { overflow: "hidden" },
  pitch: { gap: space.xl, maxWidth: 480 },
  inlineAction: { alignSelf: "flex-start" },
  paper: { paddingBottom: space.xxxl },
  paperWide: { flex: 1, maxWidth: 640 },
  merchant: { marginTop: space.s },
  rule: { height: 3, marginTop: space.l },
  summaryRow: { flexDirection: "row", alignItems: "baseline", paddingTop: space.m },
  summaryName: { flex: 1, fontSize: 16 },
  total: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: space.m },
  status: { marginTop: space.m },
  bar: { paddingTop: space.m, borderTopWidth: StyleSheet.hairlineWidth },
});

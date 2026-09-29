import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from "react-native";

import { bare, copy, gap, money, sample } from "./sample";
import { enter, press, setPageColor, useReducedMotion, focusRing } from "./web";

const palettes = {
  light: {
    table: "#E6E2D8",
    paper: "#FCFBF7",
    ink: "#1B1A17",
    faded: "#6A665C",
    rule: "#B9B4A7",
    red: "#B8321E",
    redWash: "#F7E3DC",
    onInk: "#FCFBF7",
    shadow: "rgba(40, 32, 16, 0.14)",
  },
  dark: {
    table: "#0E0D0B",
    paper: "#1C1A16",
    ink: "#ECE8DE",
    faded: "#A29D90",
    rule: "#4A463D",
    red: "#FF7A62",
    redWash: "#3A1E17",
    onInk: "#1C1A16",
    shadow: "rgba(0, 0, 0, 0.5)",
  },
};

const mono = "PlexMono, ui-monospace, Menlo, monospace";

export function Slip() {
  const c = palettes[useColorScheme() === "dark" ? "dark" : "light"];
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  useEffect(() => setPageColor(c.table), [c.table]);
  let row = 0;
  const line = () => enter(reduce, { delay: 40 + row++ * 28, duration: 220, from: "translateY(-6px)" });

  return (
    <ScrollView style={{ backgroundColor: c.table }} contentContainerStyle={[styles.page, wide && styles.pageWide]}>
      <View style={[styles.slip, { backgroundColor: c.paper, shadowColor: c.shadow }]}>
        <View style={line()}>
          <Text style={[styles.brand, { color: c.ink }]} role="heading" aria-level={1}>
            RECEIPT SPLITTER
          </Text>
        </View>
        <Dashes color={c.rule} style={line()} />
        <Text style={[styles.pitch, { color: c.ink }, line()]}>{copy.pitch}</Text>
        <Text style={[styles.small, { color: c.faded }, line()]}>{copy.privacy}</Text>

        <View style={[styles.actionWrap, line()]}>
          <Pressable
            role="button"
            aria-label={copy.scan}
            {...focusRing}
            style={({ pressed }) => [
              styles.action,
              press(),
              { backgroundColor: c.ink },
              pressed && { transform: [{ scale: 0.98 }], opacity: 0.88 },
            ]}
          >
            <Text style={[styles.actionText, { color: c.onInk }]}>SCAN A RECEIPT</Text>
          </Pressable>
          <Text style={[styles.small, styles.center, { color: c.faded }]}>{copy.scanHint.toUpperCase()}</Text>
        </View>

        <Dashes color={c.rule} style={line()} />
        <Text style={[styles.label, { color: c.faded }, line()]}>{copy.sampleLabel.toUpperCase()}</Text>
        <View style={line()}>
          <Text style={[styles.merchant, { color: c.ink }]}>{sample.merchant.toUpperCase()}</Text>
          <Text style={[styles.small, styles.center, { color: c.faded }]}>{sample.detail.toUpperCase()}</Text>
        </View>
        <Dashes color={c.rule} style={line()} />

        {sample.items.map((item) => (
          <View key={item.id} style={line()}>
            <View style={[styles.itemRow, item.flagged && { backgroundColor: c.redWash }]}>
              <Text style={[styles.mark, { color: c.red }]}>{item.flagged ? "!" : " "}</Text>
              <Text style={[styles.item, { color: item.flagged ? c.red : c.ink }]}>{item.name.toUpperCase()}</Text>
              <View style={[styles.leader, { borderColor: c.rule }]} />
              <Text style={[styles.price, { color: item.flagged ? c.red : c.ink }]}>{bare(item.cents)}</Text>
            </View>
            {item.flagged ? (
              <Text style={[styles.flagNote, { color: c.red }]}>{`  ${money(gap)} SHORT. CHECK THIS PRICE.`}</Text>
            ) : null}
          </View>
        ))}

        <Dashes color={c.rule} style={line()} />
        {[
          ["SUBTOTAL", sample.subtotal],
          ["TAX", sample.tax],
          ["TIP 20%", sample.tip],
        ].map(([label, cents]) => (
          <View key={label} style={[styles.itemRow, line()]}>
            <Text style={styles.mark}> </Text>
            <Text style={[styles.item, { color: c.faded }]}>{label}</Text>
            <View style={[styles.leader, { borderColor: c.rule }]} />
            <Text style={[styles.price, { color: c.faded }]}>{bare(cents as number)}</Text>
          </View>
        ))}
        <View style={[styles.double, { borderColor: c.ink }, line()]} />
        <View style={[styles.itemRow, line()]}>
          <Text style={styles.mark}> </Text>
          <Text style={[styles.total, { color: c.ink }]}>TOTAL</Text>
          <View style={{ flex: 1 }} />
          <Text style={[styles.total, { color: c.ink }]}>{money(sample.total)}</Text>
        </View>
        <Text style={[styles.check, { color: c.red }, line()]}>
          {`TOTAL CHECK FAILED. ${copy.short.toUpperCase()}`}
        </Text>
      </View>
      <Teeth color={c.paper} />
    </ScrollView>
  );
}

function Dashes({ color, style }: { color: string; style?: object }) {
  return <View style={[styles.dashes, { borderColor: color }, style]} />;
}

function Teeth({ color }: { color: string }) {
  return (
    <View style={styles.teeth} aria-hidden>
      {Array.from({ length: 48 }, (_, i) => (
        <View key={i} style={[styles.tooth, { borderTopColor: color }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: 24, paddingBottom: 48, paddingHorizontal: 12, alignItems: "center" },
  pageWide: { paddingTop: 72 },
  slip: {
    width: "100%",
    maxWidth: 400,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 20,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
  },
  brand: { fontFamily: mono, fontWeight: "600", fontSize: 15, letterSpacing: 3, textAlign: "center" },
  dashes: { borderBottomWidth: 1, borderStyle: "dashed", marginVertical: 14 },
  pitch: { fontFamily: mono, fontSize: 15, lineHeight: 23 },
  small: { fontFamily: mono, fontSize: 12, lineHeight: 18, letterSpacing: 0.3, marginTop: 6 },
  center: { textAlign: "center" },
  actionWrap: { marginTop: 18, marginBottom: 4 },
  action: { height: 52, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  actionText: { fontFamily: mono, fontWeight: "600", fontSize: 15, letterSpacing: 2 },
  label: { fontFamily: mono, fontSize: 11, letterSpacing: 2, textAlign: "center", marginBottom: 10 },
  merchant: { fontFamily: mono, fontWeight: "600", fontSize: 17, letterSpacing: 2, textAlign: "center" },
  itemRow: { flexDirection: "row", alignItems: "baseline", paddingVertical: 3, marginHorizontal: -8, paddingRight: 8 },
  mark: { fontFamily: mono, fontWeight: "600", fontSize: 14, width: 16, textAlign: "center" },
  item: { fontFamily: mono, fontSize: 14, lineHeight: 22 },
  leader: { flex: 1, borderBottomWidth: 1, borderStyle: "dotted", marginHorizontal: 6, alignSelf: "flex-end", marginBottom: 6 },
  price: { fontFamily: mono, fontSize: 14, fontVariant: ["tabular-nums"] },
  flagNote: { fontFamily: mono, fontSize: 11, letterSpacing: 0.5, lineHeight: 18, marginLeft: 8, marginTop: 2 },
  double: { borderTopWidth: 1, borderBottomWidth: 1, height: 4, marginVertical: 10 },
  total: { fontFamily: mono, fontWeight: "600", fontSize: 18, fontVariant: ["tabular-nums"] },
  check: { fontFamily: mono, fontSize: 11, lineHeight: 17, letterSpacing: 0.5, marginTop: 16, textAlign: "center" },
  teeth: { flexDirection: "row", width: "100%", maxWidth: 400, overflow: "hidden", height: 8 },
  tooth: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
